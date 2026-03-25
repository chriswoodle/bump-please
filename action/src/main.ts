import * as core from "@actions/core";
import { type BumpCommandFlags, bump } from "bump-please-core";

// Helper function to parse string inputs to booleans
function parseBooleanInput(input: string): boolean | undefined {
    if (!input) return undefined;
    const lowerInput = input.toLowerCase();
    return lowerInput === 'true' || lowerInput === '1' || lowerInput === 'yes' || lowerInput === 'on';
}

export const ACTION_VERSION = '__ACTION_VERSION__'

export async function run(): Promise<void> {
    try {
        core.info(`bump-please-action v${ACTION_VERSION}`)
        const flags: BumpCommandFlags = {
            ...(core.getInput("dry-run") ? { dryRun: parseBooleanInput(core.getInput("dry-run")) } : {}),
            ...(core.getInput("config-file") ? { configFile: core.getInput("config-file") } : {}),
            ...(core.getInput("disable-git-writes") ? { disableGitWrites: parseBooleanInput(core.getInput("disable-git-writes")) } : {}),
            ...(core.getInput("github-token") ? { githubToken: core.getInput("github-token") } : {}),
            ...(core.getInput("git-branch") ? { gitBranch: core.getInput("git-branch") } : {}),
            gitCommitterName: core.getInput("git-committer-name") || "github-actions[bot]",
            gitCommitterEmail: core.getInput("git-committer-email") || "github-actions[bot]@users.noreply.github.com",
            ...(core.getInput("root-package-json") ? { rootPackageJson: core.getInput("root-package-json") } : {}),
        }

        const result = await bump(flags);

        core.info(`Result: ${result}`);
    } catch (error) {
        if (error instanceof Error) core.setFailed(error.message)
    }
}
