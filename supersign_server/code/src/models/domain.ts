import { Connection } from "mongoose";
import { MongoDbUtil } from "./mongoDbUtil";
import { CodeMsgAny } from "../common/codeMsg";
import { ErrCode } from "../common/codeMsg";
import { ModelBaseDao } from "./modelBaseDao";

export interface DomainModel {
    domain: string,
    status: boolean,
}
/**
 * 允许下载用户表
 */
class DomainDao extends ModelBaseDao {
    public init = (conn: Connection): Promise<CodeMsgAny> => {
        this._model = MongoDbUtil.createModel(conn, {
            name: "sysDomain",
            schemaDefinition: {
                domain: String,
                status: Boolean,
            }
        });

        return Promise.resolve({ code: ErrCode.OK })
    }
    



}

export const domainDao = new DomainDao();