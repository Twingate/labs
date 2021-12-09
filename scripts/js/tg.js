#!/usr/bin/env -S deno run --allow-all --unstable

import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {TwingateApiClient} from "./TwingateApiClient.mjs";
import {
    exportCmd,
    getTopLevelCommand
} from "./cliCmd/cmd.mjs";

async function main(args) {

    const topLevelCommands = ["resource", "group", "user", "network", "connector", "device"];
    let cmd = new Command()
        .name("tg")
        .version(TwingateApiClient.VERSION)
        .description("CLI interface for Twingate")
        .command("export", exportCmd)
    ;
    for ( const command of topLevelCommands ) cmd = cmd.command(command, getTopLevelCommand(command));
    return await cmd.parse(args);
}

try {
    await main(Deno.args);
} catch (e) {
    console.error(`Exception: ${e.stack||e}`);
}