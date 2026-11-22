// The fixed revision below contains 19 Mandarin Ogg files for Kiri and six for
// Kanna. The two character scripts independently declare ambient / farewell /
// talk counts of 4 / 8 / 7 and 2 / 2 / 2. Their individual file categories
// survive in the lists even when the street uses one shuffle bag per person.
// https://github.com/baidwwy/dnf-godot/tree/e8d13dc8a3c3018476da61fcae4af9a30da8438b/assets/sounds/npc
// https://github.com/baidwwy/dnf-godot/tree/e8d13dc8a3c3018476da61fcae4af9a30da8438b/src/scripts/npc
//
// The shipped streams match the Git blob IDs, including the two legacy URL
// aliases kiri.ogg (kiri_amb_04) and kanna.ogg (kn_amb_02). Kanna filenames
// start with kn_ in the source. The original voice comes through without BGM.
// No separately categorised reinforcement-specific line occurs in this set.
//
// Mandarin transcriptions cross-checked with:
// https://dnf.17173.com/content/2012-12-10/1355133892.shtml
// https://dnf.17173.com/content/11142015/025541656_4.shtml
// https://www.bilibili.com/video/BV18D4y1n7se/?t=79
// Near-exact waveform matches in that independent game-audio compilation:
// Kiri amb_01–04, fw_06–07, tk_04 and tk_06; all six Kanna lines.
// This establishes coverage of the cited town voice bank. The source does
// not identify the precise Chinese client patch from which the files came.

export const kiriKannaLines = {
  kiri: [
    { text: '嗯哼，我也想学魔法。', file: 'voices/kiri_amb_01.ogg', category: 'ambient' },
    { text: '啊，令人怀念的故乡。', file: 'voices/kiri_amb_02.ogg', category: 'ambient' },
    { text: '要是念气能附加到子弹上，那该多酷啊！', file: 'voices/kiri_amb_03.ogg', category: 'ambient' },
    { text: '哦？路过的那个小伙儿，挺帅嘛。', file: 'voices/kiri.ogg', category: 'ambient' },
    { text: '你好啊，我叫凯丽。', file: 'voices/kiri_tk_01.ogg', category: 'talk' },
    { text: '有什么事吗？', file: 'voices/kiri_tk_02.ogg', category: 'talk' },
    { text: '我是从天界来的凯丽。', file: 'voices/kiri_tk_03.ogg', category: 'talk' },
    { text: '阿拉德大陆的早晨真凉爽啊！', file: 'voices/kiri_tk_04.ogg', category: 'talk' },
    { text: '你要从拿枪的姿势开始学起。', file: 'voices/kiri_tk_05.ogg', category: 'talk' },
    { text: '啊，天气不错。', file: 'voices/kiri_tk_06.ogg', category: 'talk' },
    { text: '见到你很高兴，我是凯丽。', file: 'voices/kiri_tk_07.ogg', category: 'talk' },
    { text: '注意身体。', file: 'voices/kiri_fw_01.ogg', category: 'farewell' },
    { text: '砰！（笑）', file: 'voices/kiri_fw_02.ogg', category: 'farewell' },
    { text: '后会有期。', file: 'voices/kiri_fw_03.ogg', category: 'farewell' },
    { text: '慢走啊。', file: 'voices/kiri_fw_04.ogg', category: 'farewell' },
    { text: '一定要保重啊！', file: 'voices/kiri_fw_05.ogg', category: 'farewell' },
    { text: '下次一定要教我魔法哦，我会等你的。', file: 'voices/kiri_fw_06.ogg', category: 'farewell' },
    { text: '谢谢你来找我。', file: 'voices/kiri_fw_07.ogg', category: 'farewell' },
    { text: '如果天界有消息，一定要告诉我哦。', file: 'voices/kiri_fw_08.ogg', category: 'farewell' },
  ],
  kanna: [
    { text: '瞧一瞧，看一看啦！', file: 'voices/kanna_amb_01.ogg', category: 'ambient' },
    { text: '勇士，你要去哪儿？', file: 'voices/kanna.ogg', category: 'ambient' },
    { text: '需要我帮忙吗？', file: 'voices/kanna_tk_01.ogg', category: 'talk' },
    { text: '随便挑一个吧。', file: 'voices/kanna_tk_02.ogg', category: 'talk' },
    { text: '愿祝福常伴你。', file: 'voices/kanna_fw_01.ogg', category: 'farewell' },
    { text: '一路保重！', file: 'voices/kanna_fw_02.ogg', category: 'farewell' },
  ],
};
