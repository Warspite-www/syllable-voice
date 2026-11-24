# 第三方声明 / Third-party notices

## bibibobo

- 项目：https://github.com/hakihakii/bibibobo
- 作者：hakihakii (Lumoswitch)
- 许可证：MIT
- 版权声明：`Copyright (c) 2026 hakihakii (Lumoswitch)`

本 demo 的 `src/engine.js` 派生自该项目的 `bibibobo.js`，保留原始版权与许可声明。相对上游的修改：

1. 把口型表（`VOWELS`）与声线参数（`VOICES`）抽离为 `src/corpus.js`、`src/presets.js` 中的数据；
2. 音高、口型、起音改用同一哈希的不同位切片选取，解除"音高与口型完全相关"的耦合；
3. 新增起音辅音（噪声 / 爆破 / 鼻音）、双元音共振峰滑动、字间重叠；
4. 新增效果链（混响、低通、位深压缩、限幅驱动）；
5. `synth()` 返回值由 `Float32Array` 改为带统计信息的对象。

上游许可全文见 `LICENSE`。网页页脚保留 `© 2026 hakihakii (Lumoswitch)` 与项目链接。

## 素材

本 demo 不含任何录音、图片或角色素材；波形、图标均为代码绘制。若后续接入"大肥鱼"等角色形象，需另行确认原作者授权（社区素材通常为 CC BY-NC-SA，禁止商用）。
