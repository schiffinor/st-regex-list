/*  Regex-Lister extension  ▸  index.js
 *  Adds a slash-command `/regex-list` that returns the names of every
 *  *currently-active* Regex script (global + scoped, excluding disabled).
 *  ──────────────────────────────────────────────────────────────────────── */

import { extension_settings } from '../../../extensions.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';

/* ---------- helpers ---------------------------------------------------- */

/**
 * Collect the script-objects seen by getRegexedString() and
 * return an array of their human-readable names.
 * @returns {string[]}
 */
function getActiveRegexScripts() {
    // Global Regex scripts from settings
    const global = extension_settings.regex ?? [];

    // Merge, drop disabled, map to name
    return [...global]
        .filter(script => !script.disabled)
        .map(script => script.scriptName || script.name || 'unnamed');
}


/* ---------- slash-command registration -------------------------------- */



SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name:     'regex-list',
    aliases:  ['regexes', 'rl'],
    helpString: 'Return the names of all active regex scripts.',
    returns:  'comma-separated list',

    callback: (args /*named*/, _value /*unnamed*/) => {
        const sep = typeof args.sep === 'string' && args.sep.length
            ? args.sep : ', ';
        return getActiveRegexScripts().join(sep);
    },

    /* named args */
    namedArgumentList: [
        SlashCommandNamedArgument.fromProps({
            name:         'sep',
            description:  'Separator string (default: ", ")',
            isRequired:   false,
            typeList:     [ARGUMENT_TYPE.STRING],
            defaultValue: ', ',
        }),
    ],

    /* this command takes no unnamed args */
    unnamedArgumentList: [],
}));

console.log('[Regex-Lister] Slash command /regex-list registered');

