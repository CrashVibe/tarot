import path from "path";
import { Config } from ".";
import * as fs from "fs/promises";
import tarot_json from "./tarot.json";
import { h, Random, Session } from "koishi";
import {} from "koishi-plugin-adapter-onebot";
// 类型定义
interface CardInfo {
    type: string;
    pic: string;
    name_cn: string;
    meaning: {
        up: string;
        down: string;
    };
}

interface ThemeConfig {
    [theme: string]: string[];
}

const OFFICIAL_THEMES: ThemeConfig = {
    BilibiliTarot: ["MajorArcana", "Cups", "Pentacles", "Sowrds", "Wands"],
    TouhouTarot: ["MajorArcana"]
};

const ALL_SUB_TYPES = ["MajorArcana", "Cups", "Pentacles", "Sowrds", "Wands"];

export default class Tarot {
    tarot_json: string;
    is_chain_reply: boolean;

    constructor(config: Config) {
        this.tarot_json = path.join(__dirname, "tarot.json");
        this.is_chain_reply = config.is_chain_reply;
    }

    async divine(session: Session) {
        const theme = await this.pick_theme();
        const allCards = tarot_json.cards;
        const all_formations = tarot_json.formations;

        const formation_name = Random.pick(Object.keys(all_formations)) as keyof typeof all_formations;
        const formation = all_formations[formation_name];

        await session.send(h.quote(session.messageId) + `启用 ${formation_name}，让命运之轮开始转动...`);

        const { cards_num, is_cut } = formation;

        const cards_indo_list = await this.random_cards(allCards, theme, cards_num);
        const representations = Random.pick(formation.representations);

        const chain = [];
        for (let i = 0; i < cards_indo_list.length; i++) {
            const msg_header = `${is_cut && i === cards_num - 1 ? "切牌" : `第${i + 1}张牌`}「${
                representations[i]
            }」\n`;
            const msg_body = await this.get_text_and_image(theme, cards_indo_list[i], true);
            if (!this.is_chain_reply || !session.onebot) {
                session.send(h.quote(session.messageId) + msg_header + msg_body);
            } else {
                chain.push(msg_header + msg_body);
            }
        }

        if (this.is_chain_reply && session.onebot) {
            const nodeList = chain.map((text) => ({
                type: "node",
                data: {
                    user_id: session.bot?.userId,
                    nickname: session.username || "你",
                    content: text
                }
            }));
            if (session.guildId) {
                await session.onebot.sendGroupForwardMsg(session.guildId, nodeList);
            } else if (session.userId) {
                await session.onebot.sendPrivateForwardMsg(session.userId, nodeList);
            }
        } else {
            return;
        }
    }

    async onetime_divine() {
        const theme = await this.pick_theme();
        const allCards = tarot_json.cards;
        const [cardInfo] = await this.random_cards(allCards, theme, 1);
        const body = await this.get_text_and_image(theme, cardInfo);

        return "回应是" + body;
    }

    private async get_text_and_image(theme: string, cardInfo: CardInfo, useCQ = false) {
        const { type, pic, name_cn, meaning } = cardInfo;

        if (!type || !pic || !name_cn || !meaning?.up || !meaning?.down) {
            throw new Error("卡牌信息不完整或格式错误");
        }

        const imgDir = path.join(__dirname, "resource", theme, type);
        const files = await fs.readdir(imgDir);
        const imgFile = files.find((file) => file.startsWith(pic + "."));

        if (!imgFile) {
            throw new Error(`塔罗图片未找到：${theme}/${type}/${pic}`);
        }

        const imgBuffer = await fs.readFile(path.join(imgDir, imgFile));
        const isReversed = Math.random() < 0.5;
        const meaningText = isReversed ? meaning.down : meaning.up;
        const position = isReversed ? "逆位" : "正位";
        if (useCQ) {
            // 用于消息合并时
            return (
                `「${name_cn}${position}」「${meaningText}」\n` +
                "[CQ:image,file=base64://" +
                imgBuffer.toString("base64") +
                "]"
            );
        }
        return (
            `「${name_cn}${position}」「${meaningText}」\n` +
            h.image("data:image/png;base64," + imgBuffer.toString("base64"))
        );
    }

    private async random_cards(allCards: Record<string, CardInfo>, theme: string, num = 1): Promise<CardInfo[]> {
        const subTypes = await this.pick_sub_types(theme);

        if (subTypes.length === 0) {
            throw new Error(`本地塔罗牌主题 "${theme}" 没有可用子类型！请检查资源。`);
        }

        const validCards = Object.values(allCards).filter(
            (card): card is CardInfo =>
                typeof card === "object" && card.type !== undefined && subTypes.includes(card.type)
        );

        const shuffled = validCards.sort(() => Math.random() - 0.5);
        return shuffled.slice(0, num);
    }

    private async pick_theme(): Promise<string> {
        const resourceDir = path.join(__dirname, "resource");
        const dirs = await fs.readdir(resourceDir, { withFileTypes: true });
        const customThemes = dirs.filter((d) => d.isDirectory()).map((d) => d.name);
        const allThemes = Array.from(new Set([...customThemes, ...Object.keys(OFFICIAL_THEMES)]));

        if (allThemes.length > 0) {
            return allThemes[Math.floor(Math.random() * allThemes.length)];
        }

        // 兜底
        const officialKeys = Object.keys(OFFICIAL_THEMES);
        return officialKeys[Math.floor(Math.random() * officialKeys.length)];
    }

    private async pick_sub_types(theme: string): Promise<string[]> {
        if (theme in OFFICIAL_THEMES) {
            return OFFICIAL_THEMES[theme];
        }

        const resourceDir = path.join(__dirname, "resource", theme);
        try {
            const files = await fs.readdir(resourceDir, { withFileTypes: true });
            return files.filter((f) => f.isDirectory() && ALL_SUB_TYPES.includes(f.name)).map((f) => f.name);
        } catch (e) {
            return [];
        }
    }
}
