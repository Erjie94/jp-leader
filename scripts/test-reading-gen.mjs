import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

// Use tsx loader via dynamic import of compiled path isn't available;
// run heuristic + validate directly by spawning through tsx register.

const text = `日本にほん海かいで、冬ふゆのかに「ズワイガニ」をとる漁りょうが6日むいかから始はじまりました。

石川県いしかわけんでは、6日むいか午前ごぜん0時じ、18の船ふねが漁りょうを始はじめました。

そして、午前ごぜん8時じごろ、たくさん、かにをとった船ふねが金沢港かなざわこうに戻もどってきました。

漁りょうをした人ひとは「みなさんに早はやく食たべてほしいです」と話はなしていました。

「ズワイガニ」のオスをとる漁りょうは、来年らいねんの3月がつ20日はつかまで行おこないます。メスをとる漁りょうは、来月らいげつ29日にちまでです。`

console.log('chars', [...text].length)
console.log('PASSAGE_OK', [...text].length >= 40)
