// Chinese voice recordings from the baidwwy/dnf-godot archive, commit
// e8d13dc8a3c3018476da61fcae4af9a30da8438b. Both the original filenames and
// bytes are preserved. In each group amb = idle, tk = talk, fw = farewell.
// https://github.com/baidwwy/dnf-godot/tree/e8d13dc8a3c3018476da61fcae4af9a30da8438b/assets/sounds/npc/poongjin
// https://github.com/baidwwy/dnf-godot/tree/e8d13dc8a3c3018476da61fcae4af9a30da8438b/assets/sounds/npc/danjin
// The archival scripts declare 1/2/2 clips for Poongjin and 2/3/2 for each of
// the five pot merchants (idle/talk/farewell). Danjin1.tscn names 火罐 and
// binds all seven Danjin clips.
// https://github.com/baidwwy/dnf-godot/blob/e8d13dc8a3c3018476da61fcae4af9a30da8438b/src/scenes/npc/Danjin1.tscn
// The main town recording shows
// the purple pot and blue scarf during "选一个看看吧" and "绝对没有空的".
// https://www.bilibili.com/video/BV1Uh4y1e7xj/ (0:00–0:18 and 1:30–1:49)
// https://dnf.17173.com/content/2012-12-10/1355133892.shtml
export const fengFireLines = {
  fengzhen: [
    {text:'我是风拳流大师，风振。', file:'voices/pj_tk_02.ogg'},
    {text:'武艺的根本就是与自然合一。', file:'voices/pj_tk_01.ogg'},
    {text:'〔练拳的呼喝声〕', file:'voices/pj_amb_01.ogg'},
    {text:'风会指引你前进的路。', file:'voices/pj_fw_01.ogg'},
    {text:'欢迎你再来。', file:'voices/pj_fw_02.ogg'}
  ],
  firepot: [
    {text:'选一个看看吧。', file:'voices/dj_tk_01.wav'},
    {text:'绝对没有空的。', file:'voices/dj_tk_02.wav'},
    {text:'祝你发大财！', file:'voices/dj_tk_03.wav'},
    {text:'来来，以钱赚钱啦！', file:'voices/dj_amb_01.wav'},
    {text:'来选一个吧。', file:'voices/dj_amb_02.wav'},
    {text:'嘿嘿，偶尔有个空的也情有可原嘛。', file:'voices/dj_fw_01.wav'},
    {text:'欢迎下次再来哦。', file:'voices/dj_fw_02.wav'}
  ]
};
