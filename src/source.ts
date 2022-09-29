import { EventSource } from 'discord-interceptors'
import { workshopItem, SteamUserJSON, Constants } from 'steam-events'
import type { APIActionRowComponent, APIEmbed, APIMessageActionRowComponent } from 'discord-api-types/v10'

declare const WORKSHOP_WEBHOOK: string;
declare const WEBHOOK_DOWNLOAD_URL: string;

type WorkshopEventname = keyof workshopItem['time']

export const createWebhook = (url: string) => ({ url })

const formatWorkshopEmbed = ({ 
    time, id, title, preview, description 
}: workshopItem<SteamUserJSON>): {
    components: APIActionRowComponent<APIMessageActionRowComponent>[] 
} & Partial<APIEmbed> => {
    const date = `${new Date(Number(`${time.created}000`)).toString().replace('+0000 (Coordinated Universal Time)', '')}`

    return {
        footer: {
            text: `Published on: ${date}`
        },
        title,
        url: Constants.Routes.web.item.page(id),
        description: description.slice(0, 180),
        image: {
            url: preview.url
        },
        components: [
            {
                type: 1,
                components: [
                    {
                        label: 'View',
                        url: Constants.Routes.web.item.page(id),
                        style: 5,
                        type: 2
                    },
                    {
                        label: 'Download',
                        url: WEBHOOK_DOWNLOAD_URL.concat(id),
                        style: 5,
                        type: 2
                    }
                ]
            }
        ]
    }
}

export class WorkshopEventSource extends EventSource<
    workshopItem<SteamUserJSON>, 
    WorkshopEventname, 
    { name: string, item: workshopItem<SteamUserJSON> },
    workshopItem<SteamUserJSON> | Response
    > {
    constructor () {
        super({
            webhook: createWebhook(WORKSHOP_WEBHOOK),
            defaultEvent: {},
            filter: (req) => new URL(req.url).pathname.startsWith('/workshop'),
            events: [
                {
                    name: 'created',
                    transformMessage: (event) => {
                        const { components, ...embed } = formatWorkshopEmbed(event)

                        return {
                            embeds: [
                                {
                                    ...embed,
                                    color: 0x00dbbe
                                }
                            ],
                            components
                        }
                    }
                },
                {
                    name: 'updated',
                    transformMessage: (event) => {
                        const { components, ...embed } = formatWorkshopEmbed(event)

                        return {
                            embeds: [
                                {
                                    ...embed,
                                    color: 0x004DBA
                                }
                            ],
                            components
                        }
                    }
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
                const { name, item } = event;

                const rule = this.findRule(item, (rule) => {
                    return {
                        match: rule.name === name,
                        name
                    }
                })

                if (!rule) return new Response(undefined, { status: 500 })

                await this.postRule(rule, item, { 
                    data: event, 
                    embed: undefined 
                })

                return item
            }
        })
    }
}
