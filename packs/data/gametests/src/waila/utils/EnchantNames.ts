/**
 * R4.10: 附魔中文映射表（Bedrock 附魔 id → 中文名）
 * translate key 在游戏里不可靠（enchantment.unbreaking 不生效），改用内置表
 */
export const ENCHANT_ZH: Record<string, string> = {
	"protection": "保护",
	"fire_protection": "火焰保护",
	"feather_falling": "轻灵",
	"blast_protection": "爆炸保护",
	"projectile_protection": "弹射物保护",
	"thorns": "荆棘",
	"respiration": "水下呼吸",
	"depth_strider": "深海探索者",
	"aqua_affinity": "水下速掘",
	"frost_walker": "冰霜行者",
	"sharpness": "锋利",
	"smite": "亡灵杀手",
	"bane_of_arthropods": "节肢杀手",
	"knockback": "击退",
	"fire_aspect": "火焰附加",
	"looting": "抢夺",
	"sweeping_edge": "横扫之刃",
	"efficiency": "效率",
	"silk_touch": "精准采集",
	"unbreaking": "耐久",
	"fortune": "时运",
	"power": "力量",
	"punch": "冲击",
	"flame": "火矢",
	"infinity": "无限",
	"luck_of_the_sea": "海之眷顾",
	"lure": "饵钓",
	"mending": "经验修补",
	"curse_of_binding": "绑定诅咒",
	"curse_of_vanishing": "消失诅咒",
	"riptide": "激流",
	"loyalty": "忠诚",
	"channeling": "引雷",
	"impaling": "穿刺",
	"multishot": "多重射击",
	"piercing": "穿透",
	"quick_charge": "快速装填",
	"soul_speed": "灵魂疾行",
	"swift_sneak": "迅捷潜行",
	"wind_burst": "风爆",
	"density": "致密",
	"breach": "破甲",
};

/** 附魔等级 → 罗马数字（1-10） */
export function toRoman(level: number): string {
	const map: Record<number, string> = {
		1: "I", 2: "II", 3: "III", 4: "IV", 5: "V",
		6: "VI", 7: "VII", 8: "VIII", 9: "IX", 10: "X",
	};
	return map[level] ?? String(level);
}
