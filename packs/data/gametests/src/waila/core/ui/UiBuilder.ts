import { Player, RawMessage } from "@minecraft/server";
import { Registry } from "@bedrock-oss/add-on-registry";

import inventoryTokens from "../../datasets/blockInventoryTokens.json";
import {
	BlockRenderDataInterface,
	EntityRenderDataInterface,
	LookAtObjectMetadata,
} from "../../types/LookAtObjectMetadataInterface";
import { LookAtObjectTypeEnum as LookAtObjectType } from "../../types/LookAtObjectTypeEnum";
import {
	WailaSettingsValues,
	shouldDisplayFeature,
	resolveDisplayAnchor,
} from "../Settings";
import { MAX_TRACKED_EFFECTS } from "../EntityHandler";
import { ENCHANT_ZH, toRoman } from "../../utils/EnchantNames";



//#region UI Builder
export class UiBuilder {
	public static build(
		player: Player,
		metadata: LookAtObjectMetadata,
		settings: WailaSettingsValues,
		extendedInfoActive: boolean,
	): { title: RawMessage[]; subtitle: RawMessage[] } {
		const subtitleParts: RawMessage[] = [];
		if (
			metadata.type === LookAtObjectType.ENTITY &&
			!metadata.itemContextIdentifier
		) {
			subtitleParts.push({
				text: (metadata.renderData as EntityRenderDataInterface).entityId || ""
			});
		}

		const isSneaking = player.isSneaking;

		const isTileOrItemEntity =
			metadata.type === LookAtObjectType.TILE ||
			(metadata.type === LookAtObjectType.ENTITY && !!metadata.itemContextIdentifier);

		const shouldDisplayInventory =
			metadata.type === LookAtObjectType.TILE &&
			shouldDisplayFeature(
				settings.containerInventoryVisibility,
				isSneaking,
			);

		const prefixType = isTileOrItemEntity ? "A" : "B";

		let healthOrArmor = "";
		let finalTagIcons = "";
		let effectsStr = "";
		let inventoryOverflow = 0;

		if (isTileOrItemEntity) {
			if (metadata.type === LookAtObjectType.TILE) {
				const blockData = metadata.renderData as BlockRenderDataInterface;
				finalTagIcons = blockData.toolIcons;
				if (shouldDisplayInventory) {
					inventoryOverflow = blockData.inventoryOverflow ?? 0;
				}
			} else {
				finalTagIcons = "zz,z;zz,z:";
			}
		} else {
			const entityData = metadata.renderData as EntityRenderDataInterface;
			healthOrArmor = `${entityData.healthRenderer}${entityData.armorRenderer}`;
			finalTagIcons = entityData.tagIcons;
			effectsStr = `${entityData.effectsRenderer.effectString}e${entityData.effectsRenderer.effectsResolvedArray.length
				.toString()
				.padStart(2, "0")}`;
		}

		const nameElements: RawMessage[] = [];
		if (metadata.hitIdentifier === "minecraft:player") {
			nameElements.push({ text: "__r4ui:humanoid." });
		}
		if (metadata.nameTagContextTranslationKey && metadata.hitIdentifier !== "minecraft:player") {
			nameElements.push({ text: `${metadata.displayName} §7(` });
			nameElements.push({ translate: metadata.nameTagContextTranslationKey });
			nameElements.push({ text: ")§r" });
		} else {
			nameElements.push({ translate: metadata.displayName });
		}
		if (metadata.itemInsideFrameTranslationKey) {
			nameElements.push({ text: "\n§7[" });
			nameElements.push({ translate: metadata.itemInsideFrameTranslationKey });
			nameElements.push({ text: "]§r" });
		}
		nameElements.push({ text: "§r" });

		const blockStatesText =
			metadata.type === LookAtObjectType.TILE && extendedInfoActive
				? (metadata.renderData as BlockRenderDataInterface).blockStates ?? ""
				: "";

		// R4.9: 不再显示 itemContextIdentifier（英文代码行），掉落物名已中文显示
		const itemEntityText = "";

		let healthText = "";
		let paddingNewlines = "";

		if (metadata.type === LookAtObjectType.ENTITY) {
			const entityData = metadata.renderData as EntityRenderDataInterface;

			if (entityData.maxHp > 0 && entityData.intHealthDisplay) {
				const percentage = Math.round((entityData.hp / entityData.maxHp) * 100);
				const hpDisplay =
					entityData.maxHp < 1000000
						? ` ${entityData.hp}/${entityData.maxHp} (${percentage}%)`
						: " ∞";
				healthText = `\n§7 ${hpDisplay}§r`;
			}

			if (entityData.maxHp > 0 && entityData.maxHp <= 40 && !entityData.intHealthDisplay) {
				paddingNewlines += "\n";
			}
			if (entityData.maxHp > 20 && entityData.maxHp <= 40 && !entityData.intHealthDisplay) {
				paddingNewlines += "\n";
			}
			if (entityData.maxHp > 40 && !entityData.intHealthDisplay) {
				healthText = `\n§7 ${
					entityData.maxHp < 1000000
						? `${entityData.hp}/${entityData.maxHp} (${Math.round((entityData.hp / entityData.maxHp) * 100)}%)`
						: "∞"
				}§r`;
			}

			const numEffects = entityData.effectsRenderer.effectsResolvedArray.length;
			const numEffectsThreshold = Math.ceil(MAX_TRACKED_EFFECTS / 2);
			if (numEffects > 0 && numEffects <= numEffectsThreshold) {
				paddingNewlines += "\n\n".repeat(numEffects);
			} else if (numEffects > numEffectsThreshold) {
				paddingNewlines +=
					!entityData.intHealthDisplay && entityData.maxHp > 40 ? "\n" : "\n\n";
			}

			if (entityData.armorRenderer !== "dddddddddd") {
				paddingNewlines += "\n";
			}
		}

		const showPackAuthor = shouldDisplayFeature(
			settings.packAuthorVisibility,
			isSneaking,
		);
		const namespaceText = UiBuilder.resolveNamespaceText(
			metadata.namespace,
			showPackAuthor,
		);

		// R4.9: 额外详细信息（RawMessage[][]，支持 translate 中文），蹲下时显示
		// 实体信息合并为单行（避免与心形血条控件重叠）；方块信息保持多行
		const extraInfoParts: RawMessage[] = [];
		if (isSneaking) {
			const renderData = metadata.renderData as
				| (BlockRenderDataInterface & { extraInfo?: RawMessage[][] })
				| (EntityRenderDataInterface & { extraInfo?: RawMessage[][] });
			if (renderData.extraInfo && renderData.extraInfo.length > 0) {
				if (metadata.type === LookAtObjectType.ENTITY) {
					// 单行：每行取 text 部分拼接（实体信息均为纯文本）
					const texts: string[] = [];
					for (const line of renderData.extraInfo) {
						let t = "";
						for (const p of line) {
							const obj = p as { text?: string };
							if (obj.text) t += obj.text;
						}
						t = t.replace(/§[0-9a-fk-or]/g, ""); // 去颜色码，单行重新着色
						if (t.trim().length > 0) texts.push(t);
					}
					if (texts.length > 0) {
						extraInfoParts.push({ text: "\n§7" + texts.join(" §7·§r ") + "§r" });
					}
				} else {
					// 方块：每行独立（支持 translate）
					for (const line of renderData.extraInfo) {
						extraInfoParts.push({ text: "\n" });
						extraInfoParts.push(...line);
					}
					extraInfoParts.push({ text: "§r" });
				}
			}
		}

		// R4.11: 掉落物附魔显示（内置中文表 + 罗马等级，每个附魔单独一行）
		const enchantParts: RawMessage[] = [];
		if (metadata.type === LookAtObjectType.ENTITY && metadata.itemStack) {
			try {
				const enchComp = metadata.itemStack.getComponent("minecraft:enchantable") as
					| { getEnchantments: () => { type: { id: string }; level: number }[] }
					| undefined;
				const enchList = enchComp?.getEnchantments();
				if (enchList && enchList.length > 0) {
					enchantParts.push({ text: "\n§7附魔:" });
					enchList.slice(0, 5).forEach((e) => {
						const rawId = e.type.id.replace("minecraft:", "");
						const name = ENCHANT_ZH[rawId] ?? rawId.replace(/_/g, " ");
						enchantParts.push({ text: `\n §b${name} ${toRoman(e.level)}§r` });
					});
					if (enchList.length > 5) {
						enchantParts.push({ text: `\n §8+${enchList.length - 5} 更多§r` });
					}
				}
			} catch {
				/* 忽略 */
			}
		}

		const titleParts: RawMessage[] = [
			{ text: `_r4ui:${prefixType}:` },
			{ text: healthOrArmor },
			{ text: finalTagIcons },
			{ text: effectsStr },
			...nameElements,
			{ text: itemEntityText },
			...enchantParts,
			{ text: healthText },
			{ text: paddingNewlines },
			{ text: "\n§9§o" },
			{ translate: namespaceText },
			// R4.9: 额外详细信息放在 title 末尾（namespace 之后），
			// 在 UI 中显示在名字 label 最底部，避开顶部的心形血条控件
			...extraInfoParts,
			{ text: "§r" },
		];

		const baseAnchor = resolveDisplayAnchor(settings.displayPosition, "top_middle");
		let anchorSetting = baseAnchor;
		if (isSneaking) {
			anchorSetting = resolveDisplayAnchor(
				settings.displayPositionWhenSneaking,
				baseAnchor,
			);
		}
		if (extendedInfoActive && blockStatesText.length > 0) {
			subtitleParts.push({ text: "__r4ui:block_states__" });
			subtitleParts.push({ text: blockStatesText });
		}

		if (shouldDisplayInventory && metadata.type === LookAtObjectType.TILE && inventoryOverflow > 0) {
			const clampedOverflow = Math.min(99, Math.max(0, inventoryOverflow));
			titleParts.push({ text: `__r4ui:inv.size_${clampedOverflow}__` });
		}

		titleParts.push({ text: `__r4ui:anchor.${anchorSetting}__` });

		if (
			shouldDisplayInventory &&
			metadata.type === LookAtObjectType.TILE &&
			(metadata.renderData as BlockRenderDataInterface).inventory
		) {
			for (const token of UiBuilder.collectInventoryTokens(metadata.hitIdentifier)) {
				titleParts.push({ text: token });
			}
		}

		// R4.2: 图标 token（方块→方块短名，掉落物→物品短名）push 到 subtitle，UI 据此显示图标
		let iconToken = "block";
		if (
			metadata.type === LookAtObjectType.TILE &&
			isSneaking &&
			blockStatesText &&
			blockStatesText.length > 0
		) {
			iconToken = "scan";
		} else if (
			metadata.type === LookAtObjectType.TILE &&
			metadata.hitIdentifier.includes(":")
		) {
			iconToken = metadata.hitIdentifier.split(":")[1];
		} else if (
			metadata.type === LookAtObjectType.ENTITY &&
			metadata.itemContextIdentifier
		) {
			iconToken = metadata.itemContextIdentifier.split(":")[1];
		}
		subtitleParts.push({ text: `__wI:${iconToken}__` });

		const filteredTitle = titleParts.filter(
			(part) => !(typeof part === "object" && "text" in part && part.text === ""),
		);

		return { title: filteredTitle, subtitle: subtitleParts };
	}

	private static collectInventoryTokens(blockId: string): string[] {
		const rules = inventoryTokens as InventoryTokenRule[];
		const matches: string[] = [];
		for (const rule of rules) {
			if (rule.match.some((candidate) => candidate === blockId)) {
				matches.push(rule.token);
			}
		}
		return matches;
	}

	private static resolveNamespaceText(
		namespace: string,
		showPackAuthor: boolean,
	): string {
		const value = Registry[namespace.replace(":", "")];
		if (value) {
			if (showPackAuthor && value.creator) {
				return `${value.name}\nby ${value.creator}`;
			}
			return value.name;
		}

		if (namespace.length > 3) {
			return namespace
				.replace(/_/g, " ")
				.replace(":", "")
				.toTitle()
				.abrevCaps();
		}

		return namespace.replace(":", "").toUpperCase();
	}
}



//#region Types
interface InventoryTokenRule {
	token: string;
	match: string[];
}