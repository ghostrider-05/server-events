import { DiscordInterceptor, GitHubEvent, GitHubEventSource } from 'discord-interceptors'

import { WorkshopEventSource } from './source.js'

declare const GITHUB_WEBHOOK: string;

const createWebhook = (url: string) => ({ url })

addEventListener('fetch', (event: { respondWith: (arg0: any) => any; request: any; }) => {
    return event.respondWith(handleRequest(event.request));
});

const webhook = createWebhook(GITHUB_WEBHOOK)

const interceptor = new DiscordInterceptor()
    .use(new WorkshopEventSource())
    .use(new GitHubEventSource({
        webhook,
        defaultEvent: GitHubEvent.createDefault({}),
        enchancements: {
            events: true,
            embed: {
                bodyLimit: 997
            }
        }
    }))

async function handleRequest (req: Request): Promise<Response> {
    return await interceptor.handleEvent(req).catch(() => new Response(undefined, { status: 500 })) 
        ?? new Response(undefined, { status: 500 })
}

