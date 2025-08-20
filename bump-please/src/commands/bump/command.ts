import { buildCommand } from "@stricli/core";

export const bumpCommand = buildCommand({
    loader: async () => import("./impl"),
    parameters: {
        positional: {
            kind: "tuple",
            parameters: [],
        },
        flags: {
            dryRun: {
                kind: "parsed",
                parse: Boolean,
                brief: "Dry run",
                optional: true,
            },
            configFile: {
                kind: "parsed",
                parse: String, 
                brief: "The config file to use",
                optional: true,
            },
            disableGitWrites: {
                kind: "parsed",
                parse: Boolean,
                brief: "Disable git writes",
                optional: true,
            },
            githubToken: {
                kind: "parsed",
                parse: String,
                brief: "The GitHub token to use",
                optional: true,
            },
            ghToken: {
                kind: "parsed",
                parse: String,
                brief: "The GitHub token to use",
                optional: true,
            },
            gitBranch: {
                kind: "parsed",
                parse: String,
                brief: "The branch to use",
                optional: true,
            },
            gitCommitterName: {
                kind: "parsed",
                parse: String,
                brief: "The name of the committer",
                optional: true,
            },
            gitCommitterEmail: {
                kind: "parsed",
                parse: String,
                brief: "The email of the committer",
                optional: true,
            },
            rootPackageJson: {
                kind: "parsed",
                parse: String,
                brief: "Path to the root package.json file",
                optional: true,
            },
        }
    },
    docs: {
        brief: "Bump the version",
    },
});
