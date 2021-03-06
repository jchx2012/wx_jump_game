#!/usr/bin/env node

const fs = require('fs');
var Canvas = require('canvas'),
    Image = Canvas.Image,
    exec = require('child_process').exec;
const shell = require('shelljs');
// 通过 adb 将手机截屏拉到项目目录下
function pull_screenshot() {
    shell.exec('adb shell screencap -p /sdcard/1.png');
    shell.exec('adb pull /sdcard/1.png .');
}
// 图片灰度，就是讲 rgb 三个通道的颜色降为一个维度，会丢失部分信息
function getBrightness(r, g, b) {
    return Math.round(0.3 * r + 0.59 * g + 0.11 * b);
}

// 获取小人和棋盘的坐标
function getPoint(number, url = __dirname + '/1.png') {
    let squid = fs.readFileSync(url);
    img = new Image();
    img.src = squid;
    let width = img.width;
    let height = img.height;
    let canvas = new Canvas(width, height),
        ctx = canvas.getContext('2d');

    ctx.drawImage(img, 0, 0, width, height); // 将图片加载到canvas里面
    var imageData = ctx.getImageData(0, 0, width, height);
    let data = imageData.data; // 获取图片的数据
    console.log('分辨率：', width, height);
    // 1053/1920
    let colorMap = {};
    let mapArr = [];
    var brightness = [];

    function get3(i, j) { // 获取rgb三个像素通道的值
        offset = 4 * (width * j + i);
        var red = data[offset];
        var green = data[offset + 1];
        var blue = data[offset + 2];
        return {
            red,
            green,
            blue,
        };
    }
    // 获取上下左右四个背景色的像素点，计算出背景色的范围
    let { red: red1, blue: blue1, green: green1 } = get3(200, 200);
    let { red: red2, blue: blue2, green: green2 } = get3(width - 200, 200);

    let { red: red4, blue: blue4, green: green4 } = get3(200, height - 200);
    let { red: red3, blue: blue3, green: green3 } = get3(width - 200, height - 200);

    let redMax = Math.max(red1, red2, red3, red4);
    let redMin = Math.min(red1, red2, red3, red4);
    let blueMax = Math.max(blue1, blue2, blue3, blue4);
    let blueMin = Math.min(blue1, blue2, blue3, blue4);
    let greenMax = Math.max(green1, green2, green3, green4);
    let greenMin = Math.min(green1, green2, green3, green4);
    // console.log(redMax)
    for (let j = Math.round(600 / 1920 * height); j < 1500 / 1920 * height; j += 1) {
        for (let i = 0; i < width; i += 1) {
          let { red, blue, green } = get3(i, j);
          // 将在背景色范围内的图片，至为黑色
            if (
                red >= redMin &&
                red <= redMax &&
                blue >= blueMin &&
                blue <= blueMax &&
                green >= greenMin &&
                green <= greenMax
            ) {
                red = imageData.data[offset] = 0;
                green = imageData.data[offset + 1] = 0;
                blue = imageData.data[offset + 2] = 0;
                imageData.data[offset + 3] = 0;
            }

            function beturn(x) {
                return x > 40 && x < 70;
            }
            if (beturn(red) && beturn(blue) && beturn(green)) {
                green = imageData.data[offset + 1] = 0; // 将和小人颜色相近的物体改个颜色，否则影响小人的判断，这个小人我叫他黑黑
            }

            brightness[j] = brightness[j] ? brightness[j] : [];
            let gray = getBrightness(red, green, blue);
            brightness[j][i] = getBrightness(red, green, blue); // 得到将图片灰度后的map

            // console.log(j, i, red,green,blue)
        }
    }

    let hh = {};
    let hhMax = 0;
    for (let line = Math.round(800 / 1920 * height); line < 1500 / 1920 * height; line++) {
        item = brightness[line];
        let count = 0;
        let lastIndex = 0;
        // 找小黑人的坐标，黑人的颜色值在40到65之间
        item.map((point, index) => {
            if (point > 40 && point < 65 && (lastIndex === 0 || lastIndex == index - 1)) {
                count++;
            } else {
                if (hhMax < count && (item[index + 1] < 40 || item[index + 1] > 65)) {
                    hhMax = count;
                    hh = {
                        x: index - Math.round(count / 2),
                        y: line,
                    };
                }
                count = 0;
                lastIndex = 0;
            }
        });
        // console.log('hh', line, hhMax)
    }
    console.log('小黑人坐标：', hh); // 小黑人的坐标

    let boxMax = 0;
    const box = {};
    for (let y = Math.round(600 / 1920 * height); y <= hh.y; y++) {
        const line = brightness[y];
        const length = line.length;
        const base = line[0];
        let count = 0;
        let count245 = 0;
        for (let x = 0; x < line.length; x++) {
            const point = line[x];
            let avg = point;
            if (x > 0 && x < length - 1) { // 找到和基准点不一样的颜色的物体视为棋盘
                avg = (line[x - 1] + point + line[x + 1]) / 3;
            }
            if (point == 245) {
                count245++; //白色顶点
            }
            if (count245 > 30) {
                box.y = y;
                box.x = x - Math.round(count245 / 2);
                break;
            }
            if (avg < base - 2 || avg >= base + 2) {
                count++;
                // console.log(y, x ,point)
            } else {
                if (count >= boxMax) {
                    boxMax = count;
                    box.y = y;
                    box.x = x - Math.round(count / 2); // 算出棋盘坐标
                }
                count = 0;
            }
        }
        // console.log(y ,boxMax, hhMax * 1.5)
        // 棋盘宽度比小人宽1.5倍，或者棋盘宽度变窄了，或者找到了白色顶点就退出
        if (boxMax > hhMax * 1.5 || (count < boxMax && boxMax > hhMax * 1.18) || count245 > 30) { // 得到棋盘坐标后退出
            // console.log(JSON.stringify(line), boxMax)
            break;
        }
    }
    console.log('盒子坐标：', box);
// 下面主要是一些debug用的记录点，判断自己的点找的准不准
    ctx.beginPath();
    ctx.moveTo(box.x, box.y);
    ctx.lineTo(hh.x, hh.y);
    ctx.stroke();
    var buf = canvas.toBuffer();
    fs.writeFile(`./log/${number}-0.png`, buf, () => {});
    ctx.putImageData(imageData, 0, 0); // 将去掉背景色的图片也保存下来
    ctx.moveTo(box.x, box.y);
    ctx.lineTo(hh.x, hh.y);
    ctx.stroke();
    // ctx.beginPath();
    // ctx.moveTo(0, 600);
    // ctx.lineTo(1080, 600);
    // ctx.stroke();
    // ctx.beginPath();
    // ctx.moveTo(0, 1500);
    // ctx.lineTo(1080, 1500);
    // ctx.stroke();
    var buf = canvas.toBuffer();
    fs.writeFile(`./log/${number}.png`, buf, () => {});
    return {
        box,
        hh,
    };
}

function jump({ x: x1, y: y1 }, { x: x2, y: y2 }) {
    const distance = Math.sqrt(Math.pow((x1 - x2), 2) + Math.pow((y1 - y2), 2)); // 计算两点之间的距离
    let press_time = distance * 1.31; // 时间系数，不准的话可以先调这个，系数越大，跳的越远
    press_time = Math.max(press_time, 200);
    press_time = Math.round(press_time);
    let cmd = `adb shell input swipe 500 1600 500 1601 ${press_time}`; // 模拟点击屏幕的命令
    shell.exec(cmd);
}
// jump(box, hh);

let number = 0;
function auto(params) {
    console.log('获取屏幕截图');
    pull_screenshot();
    let { hh, box } = getPoint(number);
    console.log('我要起飞啦！');
    jump(box, hh);
    console.log('随机休息一会儿~');
    let sleepTime = Math.round(Math.random() * 400 + 1250);// 时间可以自己调整，避免新的棋盘没有落下来，就开始截屏了，这样找到的点就不准了，具体时间要看手机的性能
    setTimeout(auto, sleepTime); 
    number++;
}
shell.rm('./log/*.png');

// function debug(params) {
//     let arr = [1, 2, 6, 10, 12, 38, 42, 47, 97, 121, 128, 129, 90, 174, 221, 108, 24];
//     arr = [121];
//     arr.forEach(item => {
//         getPoint(item, __dirname + `/badcase/${item}.png`);
//     });
// }

auto();

// debug();
