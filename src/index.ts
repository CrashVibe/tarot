import { Context, Schema } from "koishi";
import Tarot from "./data_manager";

export const name = "tarot";

export interface Config {
    is_chain_reply: boolean;
}

export const Config: Schema<Config> = Schema.object({
    is_chain_reply: Schema.boolean().default(false).description("是否使用合并转发")
});

export async function apply(ctx: Context, config: Config) {
    ctx.command("塔罗牌", "抽取一张塔罗牌").action(async () => {
        const tarot_manager = new Tarot(config);
        return await tarot_manager.onetime_divine();
    });
}
