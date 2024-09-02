import { chat, event_types, eventSource, is_send_press, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { delay, uuidv4 } from '../../../utils.js';

class Regex {
    /**
     * @returns {Regex}
     */
    static from(props) {
        props.regex = new RegExp(props.regex.source, props.regex.flags);
        return Object.assign(new this(), props);
    }

    /**@type {string} */ id;
    /**@type {RegExp} */ regex;
    /**@type {string} */ automationId;

    toJSON() {
        return {
            id: this.id,
            regex: {
                source: this.regex.source,
                flags: this.regex.flags,
            },
            automationId: this.automationId,
        };
    }
}
class Settings {
    /**
     *
     * @returns {Settings}
     */
    static from(props) {
        if (props.regexList) props.regexList = props.regexList.map(it=>Regex.from(it));
        return Object.assign(new this(), props);
    }

    /**@type {Regex[]} */ regexList = [];

    save() {
        extension_settings.streamRegex = this;
        saveSettingsDebounced();
    }
}
const settings = Settings.from(extension_settings.streamRegex ?? {});

const runRegexList = async(text)=>{
    const matches = [];
    for (const { regex, automationId } of settings.regexList) {
        if (regex.test(text)) {
            matches.push({ automationId });
        }
    }
    if (matches.length) {
        eventSource.emit(event_types.WORLD_INFO_ACTIVATED, matches);
    }
};

const init = async()=>{
    let len;
    let original;
    let proxy;
    let gen = false;
    while (true) {
        if (gen != is_send_press) {
            gen = is_send_press;
            console.warn('[__GEN__]', gen);
            if (gen) {
                len = chat.length;
                original = chat[len - 1];
                proxy = new Proxy(original, {
                    set: (target, p, newValue, receiver)=>{
                        if (p == 'mes') {
                            runRegexList(newValue);
                        }
                        return Reflect.set(target, p, newValue, receiver);
                    },
                });
                chat[len - 1] = proxy;
            } else if (original && proxy) {
                const idx = chat.indexOf(proxy);
                chat[idx] = original;
            }
        } else if (gen && is_send_press && len < chat.length) {
            const idx = chat.indexOf(proxy);
            chat[idx] = original;
            len = chat.length;
            original = chat[len - 1];
            proxy = new Proxy(original, {
                set: (target, p, newValue, receiver)=>{
                    if (p == 'mes') {
                        runRegexList(newValue);
                    }
                    return Reflect.set(target, p, newValue, receiver);
                },
            });
            chat[len - 1] = proxy;
        }
        await delay(100);
    }
};
init();


SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'stream-regex-add',
    /**
     *
     * @param {import('../../../slash-commands/SlashCommand.js').NamedArguments & {
     *  id:string,
     *  regex:string,
     *  automation:string,
     * }} args
     * @returns
     */
    callback: (args, value)=>{
        const re = new Regex();
        re.id = args.id ?? uuidv4();
        const old = settings.regexList.find(it=>it.id == re.id);
        if (old) throw new Error(`/stream-regex-add: A regex with this ID already exists: ${re.id}`);
        re.regex = new RegExp(
            args.regex.replace(/^\/(.+)\/([a-z]*)$/, '$1'),
            args.regex.replace(/^\/(.+)\/([a-z]*)$/, '$2'),
        );
        re.automationId = args.automation;
        settings.regexList.push(re);
        settings.save();
        return re.id;
    },
    namedArgumentList: [
        SlashCommandNamedArgument.fromProps({ name: 'id',
            description: 'ID used to update or delete the regex',
            defaultValue: 'a unique random ID (UUID)',
        }),
        SlashCommandNamedArgument.fromProps({ name: 'regex',
            description: 'regex in the form of /matcher/flags',
            isRequired: true,
        }),
        SlashCommandNamedArgument.fromProps({ name: 'automation',
            description: 'automation ID used to trigger Quick Replies',
            isRequired: true,
        }),
    ],
    returns: 'ID of the updated regex',
    helpString: `
        <div>
            Add a new regex to be executed during streaming that triggers Quick Replies
            by their automation ID on match.
        </div>
        <div>
            <strong>Examples:</strong>
            <ul>
                <li>
                    <pre><code class="language-stscript">/stream-regex-add id=myRegex regex=/\\n/ automation=STOP</code></pre>
                    Adds a new regex that will trigger QRs with the automation ID "STOP" when a newline is found
                    in the streamed message.
                </li>
            </ul>
        </div>
    `,
}));

SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'stream-regex-update',
    /**
     *
     * @param {import('../../../slash-commands/SlashCommand.js').NamedArguments & {
     *  id:string,
     *  regex:string,
     *  automation:string,
     * }} args
     * @returns
     */
    callback: (args, value)=>{
        const re = settings.regexList.find(it=>it.id == args.id);
        if (!re) throw new Error(`/stream-regex-update: A regex with this ID does not exist: ${re.id}`);
        if (args.regex) {
            re.regex = new RegExp(
                args.regex.replace(/^\/(.+)\/([a-z]*)$/, '$1'),
                args.regex.replace(/^\/(.+)\/([a-z]*)$/, '$2'),
            );
        }
        if (re.automationId) {
            re.automationId = args.automation;
        }
        settings.regexList.push(re);
        settings.save();
        return re.id;
    },
    namedArgumentList: [
        SlashCommandNamedArgument.fromProps({ name: 'id',
            description: 'ID of the regex to delete',
            isRequired: true,
        }),
        SlashCommandNamedArgument.fromProps({ name: 'regex',
            description: 'regex in the form of /matcher/flags',
            isRequired: false,
        }),
        SlashCommandNamedArgument.fromProps({ name: 'automation',
            description: 'automation ID used to trigger Quick Replies',
            isRequired: false,
        }),
    ],
    returns: 'ID of the updated regex',
    helpString: `
        <div>
            Update a regex to be executed during streaming that triggers Quick Replies
            by their automation ID on match.
        </div>
        <div>
            <strong>Examples:</strong>
            <ul>
                <li>
                    <pre><code class="language-stscript">/stream-regex-update id=myRegex regex=/\\n\\n/</code></pre>
                </li>
            </ul>
        </div>
    `,
}));

SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'stream-regex-delete',
    /**
     *
     * @param {import('../../../slash-commands/SlashCommand.js').NamedArguments & {
     *  id:string,
     * }} args
     * @returns
     */
    callback: (args, value)=>{
        const re = settings.regexList.find(it=>it.id == args.id);
        if (!re) throw new Error(`/stream-regex-delete: A regex with this ID does not exist: ${re.id}`);
        settings.regexList.splice(settings.regexList.indexOf(re), 1);
        settings.save();
        return re.id;
    },
    namedArgumentList: [
        SlashCommandNamedArgument.fromProps({ name: 'id',
            description: 'ID of the regex to delete',
            isRequired: true,
        }),
    ],
    returns: 'ID of the deleted regex',
    helpString: `
        <div>
            Delete regex to be executed during streaming that triggers Quick Replies
            by their automation ID on match.
        </div>
        <div>
            <strong>Examples:</strong>
            <ul>
                <li>
                    <pre><code class="language-stscript">/stream-regex-delete id=myRegex</code></pre>
                </li>
            </ul>
        </div>
    `,
}));

SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'stream-regex-list',
    /**
     *
     * @param {import('../../../slash-commands/SlashCommand.js').NamedArguments & {
     * }} args
     * @returns
     */
    callback: (args, value)=>{
        return JSON.stringify(settings.regexList);
    },
    returns: 'list of all stream regex items',
    helpString: `
        <div>
            Get a list of all registered stream regex items.
        </div>
        <div>
            <strong>Examples:</strong>
            <ul>
                <li>
                    <pre><code class="language-stscript">/stream-regex-list |\n/json-pretty |\n/comment \`\`\`{{newline}}{{pipe}}{{newline}}\`\`\`</code></pre>
                </li>
            </ul>
        </div>
    `,
}));
