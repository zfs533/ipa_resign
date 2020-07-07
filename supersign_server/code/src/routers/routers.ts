import * as express from "express";
import { newIpaApi } from "../controller/newIpaApi";
import { accountApi } from "../controller/accountApi";
import { adminApi } from "../controller/adminApi";
import { ipaFileApi } from "../controller/ipaFileApi";
import { systemApi } from "../controller/systemApi";
import { file } from "../controller/testFile";
import { bindTask } from "../task/changeActTask";
export const router = express.Router();

function asyncWrapper(fn: (req: express.Request, res: express.Response) => Promise<any>): express.RequestHandler {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
        fn(req, res)
            .then(next)
            .catch(next);
    }
}


/*------------重签ipa包------------*/
/* 第一个落地页 */
router.get("/sign", asyncWrapper(newIpaApi.first));
/* 下载 */
router.get("/downIpa", asyncWrapper(newIpaApi.downIpa));
/* 注册设备udid */
router.post("/sign/getUdidIpa/:pid", asyncWrapper(newIpaApi.getUdidIpa));
/* 第二个落地页，签名中每秒一次检测 */
router.get("/sign/isIpa", newIpaApi.isIpa);
/* 下载记录 */
router.post("/sign/upDlNum", asyncWrapper(newIpaApi.addDlNumber));


/*------------苹果账号管理------------*/
/* 获取签名账号列表 */
router.get("/ipa/getAct", asyncWrapper(accountApi.get));
/* 添加签名账号 */
router.post("/ipa/addAct", asyncWrapper(accountApi.add));
/*  删除签名账号 */
router.delete("/ipa/deleteAct", asyncWrapper(accountApi.delete));
/* 获取登录苹果账号验证码 */
router.post("/ipa/getYZCode", asyncWrapper(accountApi.getYZCode));


/*------------ipa包管理上传------------*/
/* 添加底包信息 */
router.post("/ipa/addIpaFile", asyncWrapper(ipaFileApi.add));
/* 修改底包信息 */
router.post("/ipa/updateIpaFile", asyncWrapper(ipaFileApi.update));
/* 获取底包信息 */
router.get("/ipa/getIpaFile", asyncWrapper(ipaFileApi.get));
/* 删除底包信息 */
router.delete("/ipa/deleteIpaFile", asyncWrapper(ipaFileApi.delete));
/* 更改开启状态 */
router.post("/ipa/enable", asyncWrapper(ipaFileApi.enableIpa));
/* 是否开启用户验证 */
router.post("/ipa/checkIpa", asyncWrapper(ipaFileApi.checkIpa));
/* 获取用户应用列表(应用详情下拉列表框) */
router.post("/ipa/oriBundles", asyncWrapper(ipaFileApi.getOriBundles));
/* 获取用户列表（用户详情下拉列表框数据） */
router.get("/ipa/getUser", asyncWrapper(ipaFileApi.getUser));
/* 补充bundleid */
router.get("/ipa/bundle", asyncWrapper(ipaFileApi.getbundle));


/*------------用户管理------------*/
/* 用户登陆 */
router.post("/admin/login", asyncWrapper(adminApi.login));
/* 用户登出 */
router.delete("/admin/logout", asyncWrapper(adminApi.logout));
/* 修改密码 */
router.put("/admin/modifyPassword", asyncWrapper(adminApi.modifyPassword));
/* 获取信息 */
router.get("/admin/getUserInfo", asyncWrapper(adminApi.getAdminInfo));
/* 添加用户 */
router.put("/admin/addAccount", asyncWrapper(adminApi.addAccount));
/* 修改账号 */
router.post("/admin/updateAccount", asyncWrapper(adminApi.updateAdminInfo));
/* 用户列表的剩余下载数量等信息 */
router.post("/admin/all", asyncWrapper(adminApi.getAllUser));
/* 为用户添加下载数量 */
router.post("/admin/addDlTimes", asyncWrapper(adminApi.addDownloadTimes));


/*------------用户数据------------*/
/* 当前用户的剩余下载数量等信息 */
router.get("/admin/now", asyncWrapper(adminApi.userData));
/* 获取当前用户所有应用曲线图数据（包括日新增设备数） */
router.post("/admin/allapp", asyncWrapper(adminApi.getAllApp));
/* 获取当前用户某一应用曲线图数据（包括日新增设备数，账号消耗数） */
router.post("/admin/oneapp", asyncWrapper(adminApi.getOneApp));
/* 管理员界面获取当前所有用户应用总 日数据（包括日新增设备数,账号消耗数） */
router.get("/admin/datas", asyncWrapper(adminApi.getDatas));
/* 获取用户名 */
router.get("/admin/username", asyncWrapper(adminApi.getUserNames));
/* 下载用户激活码Excel文件 */
router.get("/admin/activationCode", asyncWrapper(adminApi.getActivationCodeList));
/* 获取用户全部可用的激活码 */
router.get("/admin/getAllActivationCode", asyncWrapper(adminApi.getAllActivationCode));
/* 下载用户数据统计Excel文件 */
router.get("/admin/statistics", asyncWrapper(adminApi.getStatisticsList));
/* 获取某一个月数据 */
router.post("/admin/oneMonth", asyncWrapper(adminApi.getOneMonthData))


/*------------白名单设置------------*/
/* 添加IP白名单 */
router.post("/ipa/addIpWhiteList", systemApi.addWhitelist);
/* 删除IP白名单 */
router.post("/ipa/deleteIpWhiteList", systemApi.deleteWhitelist);
/* 查询IP白名单 */
router.post("/ipa/getIpWhiteList", systemApi.pageWhitelist);
/* 修改IP白名单 */
router.post("/ipa/updateIpWhiteList", systemApi.updateWhitelist);
/* 日志列表 */
router.post("/ipa/getOpearteLogs", systemApi.pageLog);


/*------------文件上传------------*/
/* 上传文件 */
router.post("/ipa/upload/:pid", asyncWrapper(file.uploadFlie));
/* 合并文件 */
router.get("/ipa/upload/:identifier", asyncWrapper(file.buildUp));
/* 解析文件 */
router.post("/ipa/open", asyncWrapper(file.unzip));


/*------------手动触发接口------------*/
/* 触发切换账号任务 */
router.get("/admin/changeActTask", asyncWrapper(bindTask.handleChange));
/* 触发更新关系表设备id所使用过的账号为其使用过的最新的账号 */
router.get("/admin/updateReTask", asyncWrapper(bindTask.startReplace));
/* 触发指定用户切换哪个账号 */
router.post("/admin/createByUser", asyncWrapper(bindTask.gaveUserOneAct));
/* 触发数据同步（statistics) */
router.get("/admin/synchronizeData", asyncWrapper(bindTask.handleSynchronizeData));
