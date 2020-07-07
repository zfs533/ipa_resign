import { PotatoTarget } from "../common/potatoClient";

const path = require("path");

class Config {
    /** 
     * 服务端口
    */
    port: number
    /** 
     * 数据库链接
     */
    dbUrl: string
    /**
     * 打印级别
     */
    logLevel: string
    /**
     * 是否启用谷歌二次身份验证
     */
    readonly enable2fa: boolean
    /**
     * 谷歌二次验证身份前缀标识
     */
    googleAuthPrefix: string

    /**
     * 签名域名跳转域名数组
     */
    ipaDomains: []

    /**
     * 土豆token
     */
    botToken: string

    /**
     * 土豆的一个参数
     */
    env: string

    /**
     * 土豆群参数
     */
    dataMonitor: PotatoTarget

    /**
     * 动态随机获取域名
     */
    get ipaDomain(): string {
        var index = Math.floor((Math.random() * this.ipaDomains.length));
        return this.ipaDomains[index];
    }
    set ipaDomain(i) { }
}

let configPath = path.join(__dirname, "../config/config.json");
const externalConfig = require(configPath);

export const globalCfg: Config = Object.assign(new Config(), externalConfig);