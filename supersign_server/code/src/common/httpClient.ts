import request = require("request")
import * as http from "http";
import * as queryString from 'querystring';
import { CodeMsg, CodeMsgAny, ErrCode } from "./codeMsg";
import { logger } from "./logger";

class HttpClient {
    private timeout: number = 10000;

    public getFile = (url: string): Promise<CodeMsgAny> => {
        return new Promise(resolve => {
            request.get(url, { timeout: this.timeout, encoding: null }, (err, response, resBody: Buffer) => {
                let statusCode = response ? response.statusCode : undefined;
                if (err) {
                    logger.error(`[HttpClient] get url: ${url} statusCode:${statusCode} err: ${JSON.stringify(err)}`);
                    resolve({ code: ErrCode.HttpErr, err: err });
                    return;
                }
                logger.info(`[HttpClient] get url: ${url} statusCode:${statusCode} body: ${JSON.stringify(resBody.length)} headers:, ${response.headers}`);
                resolve({ code: ErrCode.OK, msg: resBody });
            })
        })

    }

    public get = (url: string, params?: any): Promise<CodeMsgAny> => {
        return new Promise(resolve => {
            if (params) {
                let qs = queryString.stringify(params);
                if (url.indexOf('?') < 0) {
                    url += ("?" + qs);
                } else {
                    url += ("&" + qs);
                }
            }

            request.get(url, { timeout: this.timeout }, (err, response, resBody) => {
                let statusCode = response ? response.statusCode : undefined;
                if (err) {
                    logger.error(`[HttpClient] get url: ${url} params:${JSON.stringify(params)} statusCode:${statusCode} err: ${JSON.stringify(err)}`);
                    resolve({ code: ErrCode.HttpErr, err: err });
                    return;
                }
                logger.info(`[HttpClient] get url: ${url} params:${JSON.stringify(params)} statusCode:${statusCode} body: ${JSON.stringify(resBody)}`);
                resolve({ code: ErrCode.OK, msg: response });
            })
        })
    }

    public postJson = (url: string, body: any, headers?: any): Promise<CodeMsgAny> => {
        return new Promise(resolve => {
            let opt = { json: body, headers: headers, timeout: this.timeout };
            request.post(url, opt, (err, response, resBody) => {
                let statusCode = response ? response.statusCode : undefined;
                if (err) {
                    logger.error(`[HttpClient] postJson url: ${url} body:${JSON.stringify(body)} statusCode:${statusCode} err:${err}`);
                    resolve({ code: ErrCode.HttpErr, err: err });
                    return;
                }
                logger.info(`[HttpClient] postJson url: ${url} body:${JSON.stringify(body)} statusCode:${statusCode} resBody: ${JSON.stringify(resBody)}`);
                resolve({ code: ErrCode.OK, msg: resBody });
            })
        })
    }

    public head = (url: string): Promise<CodeMsg<http.IncomingMessage>> => {
        return new Promise<CodeMsg<http.IncomingMessage>>(resolve => {
            request.head(url, { timeout: this.timeout }, (err, res, body) => {
                if (err) {
                    resolve({ code: ErrCode.HttpErr, err: err });
                    return;
                }

                resolve({ code: ErrCode.OK, msg: res });
            });
        });
    }

    public postForm = (url: string, body: any, headers?: any): Promise<CodeMsgAny> => {
        return new Promise(resolve => {
            let opt = { form: body, headers: headers, timeout: this.timeout };
            request.post(url, opt, (err, response, resBody) => {
                let statusCode = response ? response.statusCode : undefined;
                if (err) {
                    logger.error(`[HttpClient] postForm url: ${url} body:${JSON.stringify(resBody)} statusCode:${statusCode} err:${JSON.stringify(err)}`);
                    resolve({ code: ErrCode.HttpErr, err: err });
                    return;
                }
                logger.info(`[HttpClient] postForm url: ${url} body:${JSON.stringify(body)} statusCode:${statusCode} resBody:${JSON.stringify(resBody)}`);
                resolve({ code: ErrCode.OK, msg: resBody });
            })
        })
    }

    public postFormData = (url: string, body: any, headers?: any, noLog?: boolean): Promise<CodeMsgAny> => {
        return new Promise(resolve => {
            let opt = { formData: body, headers: headers, timeout: 30000 };
            request.post(url, opt, (err, response, resBody) => {
                let statusCode = response ? response.statusCode : undefined;
                if (err) {
                    if (!noLog) {
                        logger.error(`[HttpClient] postFormData url: ${url} body:${JSON.stringify(resBody)} statusCode:${statusCode} err:${JSON.stringify(err)}`);
                    }
                    resolve({ code: ErrCode.HttpErr, err: err });
                    return;
                }
                if (!noLog) {
                    // 上传图片日志过大，停掉
                    logger.info(`[HttpClient] postFormData url: ${url} body:${JSON.stringify(body)} statusCode:${statusCode} resBody:${JSON.stringify(resBody)}`);
                }
                resolve({ code: ErrCode.OK, msg: resBody });
            })
        })
    }
}

export const httpClient = new HttpClient(); 