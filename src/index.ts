import { DiscordInterceptor, GitHubEventSource } from 'discord-interceptors'

import { WorkshopEventSource, type Env } from './source.js'

export default {
    fetch(request: Request, env: Env, ctx: ExecutionContext) {
        const res = new DiscordInterceptor()
            .run(
                new WorkshopEventSource(env),
                //@ts-ignore
                new GitHubEventSource({
                    webhook: env.GITHUB_WEBHOOK,
                    enchancements: {
                        events: true,
                        embed: {
                            bodyLimit: 997
                        }
                    }
                })
            )(request)

        return ctx.waitUntil(res)
    }
}
