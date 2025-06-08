/*  Regex-Lister extension  ▸  index.js
 *  Adds a slash-command `/regex-list` that returns the names of every
 *  *currently-active* Regex script (global + scoped, excluding disabled).
 *  ──────────────────────────────────────────────────────────────────────── */

import { extension_settings } from '../../../extensions.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { characters, substituteParams, substituteParamsExtended, this_chid } from '../../../../script.js';
import { regexFromString } from '../../../utils.js';

/**
 * @enum {number} Where the regex script should be applied
 */
const regex_placement = {
    /**
     * @deprecated MD Display is deprecated. Do not use.
     */
    MD_DISPLAY: 0,
    USER_INPUT: 1,
    AI_OUTPUT: 2,
    SLASH_COMMAND: 3,
    // 4 - sendAs (legacy)
    WORLD_INFO: 5,
    REASONING: 6,
};

export const substitute_find_regex = {
    NONE: 0,
    RAW: 1,
    ESCAPED: 2,
};

function sanitizeRegexMacro(x) {
    return (x && typeof x === 'string') ?
        x.replaceAll(/[\n\r\t\v\f\0.^$*+?{}[\]\\/|()]/gs, function (s) {
            switch (s) {
                case '\n':
                    return '\\n';
                case '\r':
                    return '\\r';
                case '\t':
                    return '\\t';
                case '\v':
                    return '\\v';
                case '\f':
                    return '\\f';
                case '\0':
                    return '\\0';
                default:
                    return '\\' + s;
            }
        }) : x;
}

function getScopedRegex() {
    const isAllowed = extension_settings?.character_allowed_regex?.includes(characters?.[this_chid]?.avatar);

    if (!isAllowed) {
        return [];
    }

    const scripts = characters[this_chid]?.data?.extensions?.regex_scripts;

    if (!Array.isArray(scripts)) {
        return [];
    }

    return scripts;
}


/**
 * Parent function to fetch a regexed version of a raw string
 * @param {string} rawString The raw string to be regexed
 * @param {regex_placement} placement The placement of the string
 * @param {RegexParams} params The parameters to use for the regex script
 * @returns {string} The regexed string
 * @typedef {{characterOverride?: string, isMarkdown?: boolean, isPrompt?: boolean, isEdit?: boolean, depth?: number }} RegexParams The parameters to use for the regex script
 */
function getRegexedString(rawString, placement, { characterOverride, isMarkdown, isPrompt, isEdit, depth } = {}) {
    // WTF have you passed me?
    if (typeof rawString !== 'string') {
        console.warn('getRegexedString: rawString is not a string. Returning empty string.');
        return '';
    }

    let finalString = rawString;
    if (extension_settings.disabledExtensions.includes('regex') || !rawString || placement === undefined) {
        return finalString;
    }

    const allRegex = [...(extension_settings.regex ?? []), ...(getScopedRegex() ?? [])];
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

            if (script.placement.includes(placement)) {
                finalString = runRegexScript(script, finalString, { characterOverride });
            }
        }
    });

    return finalString;
}

/**
 * Runs the provided regex script on the given string
 * @param {import('../../../extensions/regex/index.js').RegexScript} regexScript The regex script to run
 * @param {string} rawString The string to run the regex script on
 * @param {RegexScriptParams} params The parameters to use for the regex script
 * @returns {string} The new string
 * @typedef {{characterOverride?: string}} RegexScriptParams The parameters to use for the regex script
 */
function runRegexScript(regexScript, rawString, { characterOverride } = {}) {
    let newString = rawString;
    if (!regexScript || !!(regexScript.disabled) || !regexScript?.findRegex || !rawString) {
        return newString;
    }

    const getRegexString = () => {
        switch (Number(regexScript.substituteRegex)) {
            case substitute_find_regex.NONE:
                return regexScript.findRegex;
            case substitute_find_regex.RAW:
                return substituteParamsExtended(regexScript.findRegex);
            case substitute_find_regex.ESCAPED:
                return substituteParamsExtended(regexScript.findRegex, {}, sanitizeRegexMacro);
            default:
                console.warn(`runRegexScript: Unknown substituteRegex value ${regexScript.substituteRegex}. Using raw regex.`);
                return regexScript.findRegex;
        }
    };
    const regexString = getRegexString();
    const findRegex = regexFromString(regexString);

    // The user skill issued. Return with nothing.
    if (!findRegex) {
        return newString;
    }

    // Run replacement. Currently does not support the Overlay strategy
    newString = rawString.replace(findRegex, function (match) {
        const args = [...arguments];
        const replaceString = regexScript.replaceString.replace(/{{match}}/gi, '$0');
        const replaceWithGroups = replaceString.replaceAll(/\$(\d+)/g, (_, num) => {
            // Get a full match or a capture group
            const match = args[Number(num)];

            // No match found - return the empty string
            if (!match) {
                return '';
            }

            // Remove trim strings from the match
            const filteredMatch = filterString(match, regexScript.trimStrings, { characterOverride });

            // TODO: Handle overlay here

            return filteredMatch;
        });

        // Substitute at the end
        return substituteParams(replaceWithGroups);
    });

    return newString;
}

/**
 * Filters anything to trim from the regex match
 * @param {string} rawString The raw string to filter
 * @param {string[]} trimStrings The strings to trim
 * @param {RegexScriptParams} params The parameters to use for the regex filter
 * @returns {string} The filtered string
 */
function filterString(rawString, trimStrings, { characterOverride } = {}) {
    let finalString = rawString;
    trimStrings.forEach((trimString) => {
        const subTrimString = substituteParams(trimString, undefined, characterOverride);
        finalString = finalString.replaceAll(subTrimString, '');
    });

    return finalString;
}

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
        })
    ],

    /* this command takes no unnamed args */
    unnamedArgumentList: [],
}));


SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name:     'regex-apply',
    aliases:  ['regexify', 'regex-it'],
    helpString: 'Return the result of all active regex scripts on text.',
    returns:  'modified text',

    callback: (_args /*named*/, text /*unnamed*/) => {
        return getRegexedString(text.toString(), regex_placement.AI_OUTPUT, {isPrompt: true});
    },

    /* named args */
    namedArgumentList: [],

    /* this command takes no unnamed args */
    unnamedArgumentList: [
        SlashCommandArgument.fromProps({
            description: 'Raw text.', 
            isRequired: true,
            typeList: [ARGUMENT_TYPE.STRING]
        })
    ]
}));

