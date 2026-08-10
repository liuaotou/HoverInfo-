import { Logger as Log, LogLevel } from "@bedrock-oss/bedrock-boost";
import { OnWorldLoad } from "@bedrock-oss/stylish";

export default class WailaLogger {
	private constructor() {}

	public static get(whatFor?: string): Log {
		const tags = new Set<string>();
		if (whatFor) {
			tags.add(whatFor);
		}
		return Log.getLogger("WAILA", ...Array.from(tags));
	}

	@OnWorldLoad
	public static init() {
		// R4.2: 不开启调试日志输出（官方 release 构建会 drop DEBUG/LOGGING 标签，
		// 手动构建需显式关闭，否则 Debug 日志会 world.sendMessage 刷聊天框）
		Log.setTagsOutputVisibility(false);
		Log.setLevel(LogLevel.Error);
	}
}
