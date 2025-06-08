/*  Regex-Lister extension  ▸  index.js
 *  Adds a slash-command `/regex-list` that returns the names of every
 *  *currently-active* Regex script (global + scoped, excluding disabled).
 *  ──────────────────────────────────────────────────────────────────────── */

import { extension_settings } from '../../../extensions.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';
import * as regEngine from '../../../extensions/regex/engine.js'
import { string } from 'yaml/dist/schema/common/string.js';

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
        .map(script => script.scriptName || 'unnamed');
}

/**
 * Parent function to fetch a regexed version of a raw string
 * @param {string} rawString The raw string to be regexed
 * @param {RegexParams} params The parameters to use for the regex script
 * @returns {string} The regexed string
 * @typedef {{characterOverride?: string, isMarkdown?: boolean, isPrompt?: boolean, isEdit?: boolean, depth?: number }} RegexParams The parameters to use for the regex script
 */
function getRegexedString(rawString, { characterOverride, isMarkdown, isPrompt, isEdit, depth } = {}) {
    // WTF have you passed me?
    if (typeof rawString !== 'string') {
        console.warn('getRegexedString: rawString is not a string. Returning empty string.');
        return '';
    }

    let finalString = rawString;
    if (extension_settings.disabledExtensions.includes('regex') || !rawString) {
        return finalString;
    }

    const allRegex = [...(extension_settings.regex ?? [])];
    allRegex.forEach((script) => {
        if (
            // Script applies to Markdown and input is Markdown
            (script.markdownOnly && isMarkdown) ||
            // Script applies to Generate and input is Generate
            (script.promptOnly && isPrompt) ||
            // Script applies to all cases when neither "only"s are true, but there's no need to do it when `isMarkdown`, the as source (chat history) should already be changed beforehand
            (!script.markdownOnly && !script.promptOnly && !isMarkdown && !isPrompt)
        ) {
            if (isEdit && !script.runOnEdit) {
                console.debug(`getRegexedString: Skipping script ${script.scriptName} because it does not run on edit`);
                return;
            }

            // Check if the depth is within the min/max depth
            if (typeof depth === 'number') {
                if (!isNaN(script.minDepth) && script.minDepth !== null && script.minDepth >= -1 && depth < script.minDepth) {
                    console.debug(`getRegexedString: Skipping script ${script.scriptName} because depth ${depth} is less than minDepth ${script.minDepth}`);
                    return;
                }

                if (!isNaN(script.maxDepth) && script.maxDepth !== null && script.maxDepth >= 0 && depth > script.maxDepth) {
                    console.debug(`getRegexedString: Skipping script ${script.scriptName} because depth ${depth} is greater than maxDepth ${script.maxDepth}`);
                    return;
                }
            }

            
            finalString = regEngine.runRegexScript(script, finalString, { characterOverride });
            
        }
    });

    return finalString;
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

SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name:     'regexify',
    aliases:  ['regexit'],
    helpString: 'Runs all active regexes on text.',
    returns:  'regexed text',

    callback: (_namedArgs, unnamedArgs /*unnamed*/) => {
        return getRegexedString(unnamedArgs.toString())
    },

    namedArgumentList: [],

    unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'Raw Text',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                }),
            ],

}));

console.log('[Regex-Lister] Slash command /regexify registered');

