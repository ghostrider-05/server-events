import { EventSource, DiscordEventBot, DiscordWebhook } from 'discord-interceptors'
import { workshopItem, SteamUserJSON, Constants } from 'steam-events'
import type { APIActionRowComponent, APIButtonComponentWithURL, APIEmbed, APIMessageActionRowComponent } from 'discord-api-types/v10'

export interface Env {
    ITEMS_FORUM: KVNamespace

    GITHUB_WEBHOOK: string
    WORKSHOP_WEBHOOK: string
    WORKSHOP_WEBHOOK_FORUM: string

    WEBHOOK_DOWNLOAD_URL: string
    DISCORD_TOKEN: string;
    DISCORD_CHANNEL: string;
}

type WorkshopEventname = keyof workshopItem['time']
type ButtonData = [label: string, url: string]

export const createRows = (buttons: ButtonData[][]): APIActionRowComponent<APIButtonComponentWithURL>[] => {
    return buttons.map(row => ({
        type: 1,
        components: row.map(([label, url]) => ({
            label, url, style: 5, type: 2
        }))
    }))
}

function formatDate(date: number) {
    return `${new Date(Number(`${date}000`)).toString().replace('+0000 (Coordinated Universal Time)', '')}`
}

export class WorkshopEventSource extends EventSource<
    workshopItem<SteamUserJSON>,
    WorkshopEventname,
    { name: string, item: workshopItem<SteamUserJSON> },
    workshopItem<SteamUserJSON> | Response
> {
    constructor(env: Env) {
        super({
            webhook: env.WORKSHOP_WEBHOOK,
            filter: (req) => new URL(req.url).pathname.startsWith('/workshop'),
            events: [
                {
                    name: 'created',
                    transformMessage: ({ time, title, description, preview, id }) => ({
                        embeds: [
                            {
                                footer: {
                                    text: `Published on: ${formatDate(time.created)}`
                                },
                                title,
                                url: Constants.Routes.web.item.page(id),
                                description: description.slice(0, 180),
                                image: {
                                    url: preview.url
                                },
                                color: 0x00dbbe
                            }
                        ],
                        components: createRows([
                            [
                                ['View', Constants.Routes.web.item.page(id)],
                                ['Download', env.WEBHOOK_DOWNLOAD_URL.concat(id)]
                            ],
                            [['View post', env.DISCORD_CHANNEL]]
                        ])

                    }),
                    wait: true,
                    onWaited: async (item, msg) => {
                        if (!msg) return;

                        await new DiscordEventBot(env.DISCORD_TOKEN)
                            .publishMessage(msg.channel_id, msg.id)

                        const message = this._options.events!
                            .find(e => e.name === 'created')!
                            .transformMessage!(item)

                        const res = await DiscordWebhook.postWait(env.WORKSHOP_WEBHOOK_FORUM, {
                            thread_name: item.title,
                            ...message
                        })

                        const threadId = res?.thread?.id

                        await DiscordWebhook.post(env.WORKSHOP_WEBHOOK_FORUM, {
                            components: createRows([[
                                [   
                                    `More by ${item.creator.name}`,
                                    Constants.Routes.web.user.workshopFiles(item.creator.id)
                                ]
                            ]])
                        }, { thread_id: threadId })

                        await env.ITEMS_FORUM.put(item.id, threadId!)
                    }
                },
                {
                    name: 'updated',
                    transformMessage: ({ id, title, time: { created } }) => ({
                        embeds: [
                            {
                                footer: {
                                    text: `Published on: ${formatDate(created)}`
                                },
                                title: `"${title}" has been updated`,
                                url: Constants.Routes.web.item.page(id),
                                color: 0x004DBA
                            }
                        ],
                        components: createRows([
                            [['Changelog', Constants.Routes.web.item.changelog(id)]]
                        ])
                    }),
                    transformRule: async (event, rule) => {
                        let threadId = await env.ITEMS_FORUM.get(event.id)
                        
                        if (!threadId) {
                            const newThreadId = await DiscordWebhook.postWait(env.WORKSHOP_WEBHOOK, {
                                thread_name: event.title,
                                ...this._options.events!
                                    .find(e => e.name === 'created')!
                                    .transformMessage!(event)
                            }).then(msg => msg?.thread?.id)

                            if (!newThreadId) {
                                rule.cancel = true
                                return rule
                            }

                            await env.ITEMS_FORUM.put(event.id, newThreadId)

                            rule.threadId = newThreadId
                        } else {
                            rule.threadId = threadId
                        }

                        return rule
                    },
                }
            ],
            extract: async (req) => {
                const item = await req.json() as workshopItem<SteamUserJSON>
                const name = req.headers.get('workshop-event')!

                return {
                    name,
                    item
                }
            },
            process: async (event) => {
                const rule = this.findRule(event.item, (rule) => {
                    return {
                        match: rule.name === event.name,
                        name: event.name
                    }
                })

                if (!rule) return new Response(undefined, { status: 500 })

                const msg = await this.postRule<true>(rule, event.item, {
                    data: event,
                    embed: undefined
                })

                if (!msg) return new Response(undefined, { status: 500 })

                return event.item
            }
        })
    }
}
