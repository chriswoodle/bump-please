import path from "node:path";

import util from 'node:util';
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';

const exec = util.promisify(childProcess.exec);

import { z } from "zod";
import { bool, cleanEnv, str } from "envalid";

const GIT_EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
const DEFAULT_CONFIG_FILE = "bump-please-config.json";

const BumpPleaseConfig = z.object({
    dryRun: z.boolean().optional(),
    disableGitWrites: z.boolean().optional(),
    githubToken: z.string().optional(),
    gitBranch: z.string().optional(),
    gitCommitterName: z.string().optional(),
    gitCommitterEmail: z.string().optional(),
    packages: z.array(z.object({
        path: z.string(),
    })).optional(),
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

export async function bump(flags: BumpCommandFlags) {

    const env = cleanEnv(process.env, {
        DRY_RUN: bool({ desc: "Dry run", default: undefined }),
        CONFIG_FILE: str({ desc: "Path to the config file to use", default: undefined }),
        DISABLE_GIT_WRITES: bool({ desc: "Disable git writes", default: undefined }),
        GITHUB_TOKEN: str({ desc: "The GitHub token to use", default: undefined }),
        GH_TOKEN: str({ desc: "The GitHub token to use", default: undefined }),
        GIT_BRANCH: str({ desc: "The branch to use", default: undefined }),
        GIT_COMMITTER_NAME: str({ desc: "The name of the committer", default: undefined }),
        GIT_COMMITTER_EMAIL: str({ desc: "The email of the committer", default: undefined }),
        ROOT_PACKAGE_JSON: str({ desc: "Path to the root package.json file", default: undefined }),
    });


    console.log("bump command");
    const configFile = flags.configFile ?? env.CONFIG_FILE ?? DEFAULT_CONFIG_FILE;
    console.log('configFile=', configFile)
    const configFilePath = path.resolve(configFile);
    console.log('configFilePath=', configFilePath)
    const config = BumpPleaseConfig.parse(JSON.parse(fs.readFileSync(configFilePath, "utf8")));
    console.log('config=', config)

    const dryRun = flags.dryRun ?? config.dryRun ?? false;

    if (dryRun) {
        console.log("Dry run");
    }

    const originUrl = (await exec(`git config --get remote.origin.url`).catch(error => {
        console.error("No origin url found, are you in a git repository?");
        console.error(error);
        throw error;
    })).stdout.trim()

    const branch = flags.gitBranch ?? config.gitBranch ?? (await exec(`git branch --show-current`)).stdout.trim() ?? 'main'
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

    const rootPackageJsonPath = path.resolve(flags.rootPackageJson ?? env.ROOT_PACKAGE_JSON ?? './package.json')
    const rootPkgJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'))
    const tags = (await exec(`git tag -l --sort=-v:refname`)).stdout.split('\n').map(tag => tag.trim())
    console.log('tags=', tags)
    const lastTag = tags.find(tag => semanticTagPattern.test(tag))
    const commitsRange = lastTag ? `${(await exec(`git rev-list -1 ${lastTag}`)).stdout.trim()}..HEAD` : 'HEAD'
    const newCommits = (await exec(`git log --format=+++%s__%b__%h__%H ${commitsRange}`).catch(error => {
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
            return rootPkgJson.version || '1.0.0'
        }

        const [, c1, c2, c3] = semanticTagPattern.exec(lastTag) as any;
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
    for (const pkg of config.packages ?? []) {
        const pkgPath = path.resolve(pkg.path);
        if (!fs.existsSync(path.resolve(pkgPath, "package.json"))) {
            console.error(`Package ${pkgPath} does not have a package.json file`);
            continue;
        }

        const pkgJson = JSON.parse(fs.readFileSync(path.resolve(pkgPath, "package.json"), "utf8"));
        if (!pkgJson.version) {
            console.error(`Package ${pkgPath} does not have a version`);
            continue;
        }
    }

    if (dryRun) {
        console.log('Dry run - no changes made.')
        return
    }

    rootPkgJson.version = nextVersion;
    fs.writeFileSync(rootPackageJsonPath, JSON.stringify(rootPkgJson, null, 2) + '\n');

    for (const pkg of config.packages ?? []) {
        const pkgPath = path.resolve(pkg.path);
        const pkgJson = JSON.parse(fs.readFileSync(path.resolve(pkgPath, "package.json"), "utf8"));
        pkgJson.version = nextVersion;
        fs.writeFileSync(path.resolve(pkgPath, "package.json"), JSON.stringify(pkgJson, null, 2) + '\n');
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
        await exec(`git config user.name ${gitCommitterName}`)
    }
    if (gitCommitterEmail) {
        await exec(`git config user.email ${gitCommitterEmail}`)
    }

    const githubAuth = flags.githubToken ?? config.githubToken ?? env.GITHUB_TOKEN ?? env.GH_TOKEN;
    console.log('githubAuth=', githubAuth)
    if (!githubAuth) {
        console.warn("No GitHub token found, not setting remote url");
    } else {
        const repoAuthedUrl = `https://${githubAuth}@${repoHost}/${repoName}.git`
        await exec(`git remote set-url origin ${repoAuthedUrl}`)
    }

    // Prepare git commit and push
    // Hint: PAT may be replaced with a SSH deploy token
    // https://stackoverflow.com/questions/26372417/github-oauth2-token-how-to-restrict-access-to-read-a-single-private-repo
    const releaseMessage = `chore(release): ${nextVersion} [skip ci]`
    await exec(`git add -A .`)
    await exec(`git commit -am "${releaseMessage}"`)
    await exec(`git tag -a ${nextTag} HEAD -m "${releaseMessage}"`)
    await exec(`git push --follow-tags origin HEAD:refs/heads/${branch}`)

    console.log('Done!')
}