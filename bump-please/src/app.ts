import { buildApplication, buildRouteMap } from "@stricli/core";
import { buildInstallCommand, buildUninstallCommand } from "@stricli/auto-complete";
import { name, version, description } from "../package.json";
import { bumpCommand } from "./commands/bump/command";
import { nestedRoutes } from "./commands/nested/commands";

const routes = buildRouteMap({
    routes: {
        bump: bumpCommand,
        nested: nestedRoutes,
        install: buildInstallCommand("bump-please", { bash: "__bump-please_bash_complete" }),
        uninstall: buildUninstallCommand("bump-please", { bash: true }),
    },
    docs: {
        brief: description,
        hideRoute: {
            install: true,
            uninstall: true,
        },
    },
});

export const app = buildApplication(routes, {
    name,
    versionInfo: {
        currentVersion: version,
    },
});
