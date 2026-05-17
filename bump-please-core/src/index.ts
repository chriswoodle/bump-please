import path from "node:path";

import util from 'node:util';
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';

const execFile = util.promisify(childProcess.execFile);

import { z } from "zod/mini";

const DEFAULT_CONFIG_FILE = "bump-please-config.json";

const BumpPleaseEnvSchema = z.object({
    DRY_RUN: z.nullable(z.optional(z.boolean())),
    CONFIG_FILE: z.nullable(z.optional(z.string())),
    DISABLE_GIT_WRITES: z.nullable(z.optional(z.boolean())),
    GITHUB_TOKEN: z.nullable(z.optional(z.string())),
    GH_TOKEN: z.nullable(z.optional(z.string())),
    GIT_BRANCH: z.nullable(z.optional(z.string())),
    GIT_COMMITTER_NAME: z.nullable(z.optional(z.string())),
    GIT_COMMITTER_EMAIL: z.nullable(z.optional(z.string())),
    ROOT_PACKAGE_JSON: z.nullable(z.optional(z.string())),
});

const BumpPleaseConfig = z.object({
    dryRun: z.nullable(z.optional(z.boolean())),
    disableGitWrites: z.nullable(z.optional(z.boolean())),
    githubToken: z.nullable(z.optional(z.string())),
    gitBranch: z.nullable(z.optional(z.string())),
    gitCommitterName: z.nullable(z.optional(z.string())),
    gitCommitterEmail: z.nullable(z.optional(z.string())),
    packages: z.nullable(z.optional(z.array(z.object({
        path: z.string(),
        jsonFileName: z.nullable(z.optional(z.string())),
        jsonPropertyPath: z.nullable(z.optional(z.string())),
    })))),
});

export interface BumpCommandFlags {
    dryRun?: boolean;
    configFile?: string;
    disableGitWrites?: boolean;
    githubToken?: string;
    ghToken?: string;
    gitBranch?: string;
    gitCommitterName?: string;
    gitCommitterEmail?: string;
    rootPackageJson?: string;
}

export interface BumpResult {
    commitSha: string;
    version: string;
}

export async function bump(flags: BumpCommandFlags): Promise<BumpResult | undefined> {
    const env = BumpPleaseEnvSchema.parse(process.env);

    console.log("bump command");
    const configFile = flags.configFile ?? env.CONFIG_FILE ?? DEFAULT_CONFIG_FILE;
    console.log('configFile=', configFile)
    const configFilePath = path.resolve(configFile);
    console.log('configFilePath=', configFilePath)

    const rootPackageJsonPath = path.resolve(flags.rootPackageJson ?? env.ROOT_PACKAGE_JSON ?? './package.json')

    let rawConfig: unknown;
    let configMissing = false;
    try {
        rawConfig = JSON.parse(fs.readFileSync(configFilePath, "utf8"));
        console.log(`Loaded config from ${configFilePath}`);
    } catch (error: any) {
        if (error?.code !== 'ENOENT') throw error;
        configMissing = true;
    }

    const rootPkgJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'))

    if (configMissing) {
        if (rootPkgJson.bumpPleaseConfig) {
            console.log(`Loaded config from "bumpPleaseConfig" key in ${rootPackageJsonPath}`);
            rawConfig = rootPkgJson.bumpPleaseConfig;
        } else {
            console.log(`No config found (looked for ${configFilePath} and "bumpPleaseConfig" key in ${rootPackageJsonPath}); using empty config`);
            rawConfig = {};
        }
    }
    const config = BumpPleaseConfig.parse(rawConfig);
    console.log('config=', config)

    const dryRun = flags.dryRun ?? config.dryRun ?? false;

    if (dryRun) {
        console.log("Dry run");
    }

    const originUrl = (await execFile('git', ['config', '--get', 'remote.origin.url']).catch(error => {
        console.error("No origin url found, are you in a git repository?");
        console.error(error);
        throw error;
    })).stdout.trim()

    const branch = flags.gitBranch ?? config.gitBranch ?? (await execFile('git', ['branch', '--show-current'])).stdout.trim() ?? 'main'
    const [, , repoHost, repoName] = originUrl.replace(':', '/').replace(/\.git/, '').match(/.+(@|\/\/)([^/]+)\/(.+)$/) as any
    const repoPublicUrl = `https://${repoHost}/${repoName}`

    // Commits analysis
    const semanticTagPattern = /^v?(\d+)\.(\d+)\.(\d+)$/
    const releaseSeverityOrder = ['major', 'minor', 'patch']
    const semanticRules: { group: string, releaseType: string, prefixes?: string[], keywords?: string[] }[] = [
        { group: 'Features', releaseType: 'minor', prefixes: ['feat'] },
        { group: 'Fixes & improvements', releaseType: 'patch', prefixes: ['fix', 'perf', 'refactor', 'docs'] },
        { group: 'BREAKING CHANGES', releaseType: 'major', keywords: ['BREAKING CHANGE', 'BREAKING CHANGES'] },
    ];

    const tags = (await execFile('git', ['tag', '-l', '--sort=-v:refname'])).stdout.split('\n').map(tag => tag.trim())
    console.log('tags=', tags)
    const lastTag = tags.find(tag => semanticTagPattern.test(tag))
    const commitsRange = lastTag ? `${(await execFile('git', ['rev-list', '-1', lastTag])).stdout.trim()}..HEAD` : 'HEAD'
    const newCommits = (await execFile('git', ['log', '--format=+++%s__%b__%h__%H', commitsRange]).catch(error => {
        console.error("Error getting commits, are you in a working tree?");
        console.error(error);
        throw error;
    }))
        .stdout
        .split('+++')
        .filter(Boolean)
        .map(msg => {
            const [subj, body, short, hash] = msg.split('__').map(raw => raw.trim()) as [string, string, string, string]
            return { subj, body, short, hash }
        })

    const semanticChanges = newCommits.reduce((acc, { subj, body, short, hash }) => {
        semanticRules.forEach(({ group, releaseType, prefixes, keywords }) => {
            const prefixMatcher = prefixes && new RegExp(`^(${prefixes.join('|')})(\\([a-z0-9\\-_]+\\))?:\\s.+$`)
            const keywordsMatcher = keywords && new RegExp(`(${keywords.join('|')}):\\s(.+)`)
            const change = prefixMatcher ? subj.match(prefixMatcher)?.[0] : keywordsMatcher ? body.match(keywordsMatcher)?.[2] : undefined

            if (change) {
                acc.push({
                    group,
                    releaseType,
                    change,
                    subj,
                    body,
                    short,
                    hash
                })
            }
        })
        return acc
    }, [] as { group: string, releaseType: string, change: string, subj: string, body: string, short: string, hash: string }[])
    console.log('semanticChanges=', semanticChanges)

    const nextReleaseType = releaseSeverityOrder.find(type => semanticChanges.find(({ releaseType }) => type === releaseType))
    if (!nextReleaseType) {
        console.log('No semantic changes - no semantic release.')
        return
    }
    const nextVersion = ((lastTag, releaseType) => {
        if (!releaseType) {
            return
        }
        if (!lastTag) {
            console.log('No last tag - using root package.json version')
            lastTag = rootPkgJson.version || '0.0.0'
        }

        const [, c1, c2, c3] = semanticTagPattern.exec(lastTag!) as any;
        if (releaseType === 'major') {
            return `${-~c1}.0.0`
        }
        if (releaseType === 'minor') {
            return `${c1}.${-~c2}.0`
        }
        if (releaseType === 'patch') {
            return `${c1}.${c2}.${-~c3}`
        }
    })(lastTag, nextReleaseType)

    console.log('nextVersion=', nextVersion)

    const nextTag = 'v' + nextVersion
    const releaseDiffRef = lastTag ? `## [${nextVersion}](${repoPublicUrl}/compare/${lastTag}...${nextTag}) (${new Date().toISOString().slice(0, 10)})` : `## [${nextVersion}](${repoPublicUrl}/commits/${nextTag}) (${new Date().toISOString().slice(0, 10)})`
    const releaseDetails = Object.values(semanticChanges
        .reduce((acc, { group, change, short, hash }) => {
            const { commits } = acc[group] || (acc[group] = { commits: [], group })
            const commitRef = `* ${change} ([${short}](${repoPublicUrl}/commit/${hash}))`

            commits.push(commitRef)

            return acc
        }, {} as { [key: string]: { commits: string[], group: string } }))
        .map(({ group, commits }) => `\n### ${group}\n${commits.join('\n')}`).join('\n')

    const releaseNotes = releaseDiffRef + '\n' + releaseDetails + '\n'
    console.log('releaseNotes=', releaseNotes)


    // Validate packages
    const validationErrors: string[] = [];
    for (const pkg of config.packages ?? []) {
        const pkgPath = path.resolve(pkg.path);
        const jsonFileName = pkg.jsonFileName ?? "package.json";
        const jsonFilePath = path.resolve(pkgPath, jsonFileName);
        if (!fs.existsSync(jsonFilePath)) {
            const message = `Package ${pkgPath} does not have a ${jsonFileName} file`;
            console.error(message);
            validationErrors.push(message);
            continue;
        }

        const pkgJson = JSON.parse(fs.readFileSync(path.resolve(pkgPath, "package.json"), "utf8"));
        if (!pkgJson.version) {
            validationErrors.push(`Package ${pkgPath} does not have a version`);
            continue;
        }
    }
    if (validationErrors.length > 0) {
        console.error('Validation errors:', validationErrors.join('\n'));
        throw new Error('Validation errors');
    }

    if (dryRun) {
        console.log('Dry run - no changes made.')
        return
    }

    // Track modified files for targeted staging
    const modifiedFiles: string[] = [];

    rootPkgJson.version = nextVersion;
    fs.writeFileSync(rootPackageJsonPath, JSON.stringify(rootPkgJson, null, 2) + '\n');
    modifiedFiles.push(rootPackageJsonPath);

    for (const pkg of config.packages ?? []) {
        const pkgPath = path.resolve(pkg.path);
        const jsonFileName = pkg.jsonFileName ?? "package.json";
        const jsonFilePath = path.resolve(pkgPath, jsonFileName);
        const jsonContents = JSON.parse(fs.readFileSync(jsonFilePath, "utf8"));
        const jsonPropertyPath = pkg.jsonPropertyPath ?? "version";
        const jsonProperty = jsonPropertyPath.split('.').reduce((obj, key) => obj?.[key], jsonContents);
        if (!jsonProperty) {
            const message = `Package ${pkgPath} does not have a ${jsonPropertyPath} property`;
            console.error(message);
            throw new Error(message);
        }
        // Set nested property using dot notation
        const pathParts = jsonPropertyPath.split('.');
        const lastKey = pathParts.pop()!;
        const parentObject = pathParts.reduce((obj, key) => obj[key], jsonContents);
        parentObject[lastKey] = nextVersion;
        fs.writeFileSync(jsonFilePath, JSON.stringify(jsonContents, null, 2) + '\n');
        modifiedFiles.push(jsonFilePath);
    }

    const disableGitWrites = flags.disableGitWrites ?? config.disableGitWrites ?? env.DISABLE_GIT_WRITES ?? false;

    if (disableGitWrites) {
        console.log("Skipping git writes");
        return;
    }

    console.log('Running git commands...')
    const gitCommitterName = flags.gitCommitterName ?? config.gitCommitterName ?? env.GIT_COMMITTER_NAME;
    const gitCommitterEmail = flags.gitCommitterEmail ?? config.gitCommitterEmail ?? env.GIT_COMMITTER_EMAIL;

    if (gitCommitterName) {
        await execFile('git', ['config', 'user.name', gitCommitterName])
    }
    if (gitCommitterEmail) {
        await execFile('git', ['config', 'user.email', gitCommitterEmail])
    }

    const githubAuth = flags.githubToken ?? config.githubToken ?? env.GITHUB_TOKEN ?? env.GH_TOKEN;
    if (!githubAuth) {
        console.warn("No GitHub token found, not setting remote url");
    } else {
        const repoAuthedUrl = `https://${githubAuth}@${repoHost}/${repoName}.git`
        await execFile('git', ['remote', 'set-url', 'origin', repoAuthedUrl])
    }

    // Stage only the files we modified
    const releaseMessage = `chore(release): ${nextVersion} [skip ci]`
    await execFile('git', ['add', '--', ...modifiedFiles])
    await execFile('git', ['commit', '-m', releaseMessage])
    const { stdout: commitSha } = await execFile('git', ['rev-parse', 'HEAD'])
    await execFile('git', ['tag', '-a', nextTag, 'HEAD', '-m', releaseMessage])
    await execFile('git', ['push', '--follow-tags', 'origin', `HEAD:refs/heads/${branch}`])

    console.log('Done!')

    return { commitSha: commitSha.trim(), version: nextVersion! }
}
