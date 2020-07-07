import * as crypto from "crypto"

const iv = "0123456789abcdef";  //偏移向量
const padding = "PKCS7Padding"; //补全值

//加密
export function encryption(data: string, key: string) {
    let cipherChunks = [];
    let cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
    cipher.setAutoPadding(true);
    cipherChunks.push(cipher.update(data, "utf8", "base64"));
    cipherChunks.push(cipher.final("base64"));
    let str = cipherChunks.join("");
    return encodeURIComponent(str);
}

//解密
export function decryption(data: string, key: string) {
    let dataStr = decodeURIComponent(data);
    var cipherChunks = [];
    var decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    decipher.setAutoPadding(true);
    cipherChunks.push(decipher.update(dataStr, 'base64', 'utf8'));
    cipherChunks.push(decipher.final('utf8'));
    return cipherChunks.join('');
}

//https://supersignclub.com/sign?pid=TrcXGOM4&code=TERRQ2czaXlTWE1Wa0JRVktXR2p3NHhJMExzWENlRnlVK0haK2k0VmFlQW02ODFRSSt1UC8xanVzWDNHNzRvYw==

// let a = { "userId": "user00000001", }
// let b = JSON.stringify(a)
// console.log(b);    //{"userId":"sas","udid":"lsdhffl"}
// let mi = encryption(b, "ZY7pBdZoaOyLd0yz")
// console.log(mi);  //hUUAY3mwVMgblGlXddZVovpDiURjzzUwCeCAYGpBGSDQqvBdX5IVaDu0Ti3P6I+A
// //let mi = "LDQCg3iySXMVkBQVKWGjw+Vs+GGzEUMNcm9HIa4T458=";
// let c = decryption(mi, "ZY7pBdZoaOyLd0yz")
// console.log(c);  //{"userId":"sas","udid":"lsdhffl"}
// let d = JSON.parse(c)
// console.log(d.userId, d.udid);  //sas lsdhffl