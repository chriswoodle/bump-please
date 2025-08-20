import type { LocalContext } from "../../context";
import { type BumpCommandFlags, bump } from "bump-please-core";

export default async function (this: LocalContext, flags: BumpCommandFlags): Promise<void> {
    await bump(flags);
}
