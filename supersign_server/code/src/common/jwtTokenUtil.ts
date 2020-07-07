import * as jwt from 'jsonwebtoken';
import { logger } from './logger';

export class JwtTokenUtil {

    private constructor() { jwt.decode }

    // private static tokenMap = new Map;

    private static adminTokenSecret = "vipPack_admin_secret";

    public static token = (loginName: string, path: string): string => {
        // Token 数据
        const info = {
            loginName: loginName
        }
        // 密钥
        let secret = JwtTokenUtil.adminTokenSecret;
        // 签发 Token
        let token;
        try {
            token = jwt.sign(info, secret, { expiresIn: '7d' });
        } catch (error) {
            logger.error("createTokenError", error)
        }
        // 输出签发的 Token
        return token;
    }

    public static verify = (token: string, path: string): string => {
        return;
    }

    public static getNameFromToken = (token: string): string => {
        let secret = JwtTokenUtil.adminTokenSecret;
        let loginName: string;
        jwt.verify(token, secret, (error, decoded) => {
            if (error) {
                // logger.error(error);
                return;
            }
            try {
                loginName = JSON.parse(JSON.stringify(decoded)).loginName;
            } catch (error) {
                logger.error("getNameFromToken", error);
            }
        })
        return loginName;
    }

}