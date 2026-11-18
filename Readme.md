# Kush_ShuL Sundial Lite Edit

这是 Helian-MMCO 的派生版。Helian-MMCO 由 MoAoXnX 从 GeForceLegend 的 Sundial Lite 派生。项目沿用 GPL-3.0 许可。 [Helian-MMCO](https://github.com/MoAoXnX/Helian-mmco_Sundial-Lite_edit)，[Sundial Lite](https://github.com/GeForceLegend/Sundial-Lite)，[许可](./LICENSE)

![光影截图](https://github.com/user-attachments/assets/620e4f18-51cb-493a-a4b5-cf4138a30aad)

## 安装

1. 下载并解压仓库 ZIP，将包含 `shaders/` 的文件夹放进 Minecraft 的 `shaderpacks` 目录。 [下载 release 分支](https://github.com/Kush-ShuL/Kush_ShuL_Sundial-Lite_edit/archive/refs/heads/release.zip)
2. 使用 Iris 启动游戏，在视频设置的光影包列表中启用本光影。
3. 可按需导入 `config-presets/` 中的 RTX 3060 4K 设置。文件名含 `sky-detail` 的预设会提高体积云的采样质量。 [查看预设](./config-presets)

## 反射与全局光照

在「反射 → 反射模式」切换。光追模式需要 Iris，默认追踪范围为 96 格，可调至 16–256 格。

- **SSR Only**（默认）使用屏幕空间反射。
- **SSR+RT** 优先追踪附近的方块，可反射画面外的地形。未命中时使用 SSR。
- **RT Only** 只显示在追踪范围内命中的反射。

两种光追模式均可通过「RT 包含实体」反射玩家、生物和展示实体。

「光照 → 光追全局光照」可以独立启用一次漫反射反弹。附近像素共享表面的间接光，转动视角时可复用上一帧的结果。可以调整采样分辨率、组数、距离和间接光强度。世界空间辐照度缓存参考了 iterationRP Alpha 0.8.11。

## 超分辨率与帧生成

需要 Iris 和支持光影接口 v3 的 Super Resolution（0.9.0-alpha.1 或更新版本）。在 Mod 设置中启用光影接口，选择算法和渲染比例，然后重新加载光影。主世界、下界和末地均可使用。 [Super Resolution 光影接口文档](https://sr.187j3x1-114514.org/docs/zh/Shaderpack-Interface-documentation/Version-3/)

- **DLSS Ray Reconstruction** 需要在 Mod 中配置对应的 NVIDIA 运行库。
- **仅帧生成** 需要兼容的帧生成后端。将超分算法选为 `None` 后，光影以原生分辨率渲染并保留 TAA。
- 体积云、平面云和水面为超分提供近似运动信息，以减少移动视角时的拖影。可在「大气 → 体积雾」调整晨雾泛光强度。
