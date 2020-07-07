import Joi = require('joi');

export const addNewAccountMap = Joi.object().keys({
    act: Joi.string().trim().required(),
    pwd: Joi.string().trim().required(),
    user: Joi.string().trim().required(),
})

/**
 * 苹果账号列表
 */
export const getAccountMap = Joi.object().keys({
    act: Joi.string().trim().allow(""),//搜索账号
    page: Joi.number().required(),
    count: Joi.number().required(),
    status: Joi.string().trim().allow(""),//搜索状态
})

export const deleteAccountMap = Joi.object().keys({
    act: Joi.string().trim().required(),
    _id: Joi.string().trim().required(),
})


export const getIpaListMap = Joi.object().keys({
    ipaName: Joi.string().trim().allow(""),
    userName: Joi.string().trim().allow(""),
    page: Joi.number().required(),
    count: Joi.number().required(),
})

export const addIpaFileMap = Joi.object().keys({
    ipaName: Joi.string().trim().required(),
    ipaBrief: Joi.string().trim().required(),
    ipaType: Joi.string().trim().required(),
})

export const updateIpaFile = Joi.object().keys({
    _id: Joi.string().trim().required(),
    ipaName: Joi.string().trim().required(),
    ipaBrief: Joi.string().trim().required(),
    ipaType: Joi.string().trim().required(),
})

export const deleteIpaFileMap = Joi.object().keys({
    _id: Joi.string().trim().required(),
    pid: Joi.string().trim().required(),
})

export const enableIpaFileMap = Joi.object().keys({
    _id: Joi.string().trim().required(),
    enable: Joi.boolean().required(),
})

export const isCheckIpaFileMap = Joi.object().keys({
    pid: Joi.string().trim().required(),
    isCheck: Joi.boolean().required(),
})

export const getOriBundlesMap = Joi.object().keys({
    userName: Joi.string().trim().required(),
})

/**
 * 日志
 */
export const getSysLogMap = Joi.object().keys({
    pageNo: Joi.number().required(),//页码
    pageSize: Joi.number().required(),//行数
    loginName: Joi.string(),//用户名
    startTime: Joi.number(),//开始时间
    endTime: Joi.number(),//结束时间
    uri: Joi.string(),//请求接口
    discription: Joi.string(),//描述
})

/**
 * 苹果账号验证码
 */
export const getYanZhengCodeMap = Joi.object().keys({
    yanzhengCode: Joi.string().required().min(6).max(6),
    user: Joi.string().trim().required(),
})

/**
 * 获取用户激活码列表
 */
export const getActivationCodeMap = Joi.object().keys({
    user: Joi.string().trim().required(),//用户名
})

/**
 * 手动指定用户切换哪个账号
 */
export const gaveUserOneActMap = Joi.object().keys({
    user: Joi.string().trim().required(),//用户名
    act: Joi.string().trim().required(),//苹果账号
})

/**
 * 添加新用户
 */
export const addUserMap = Joi.object().keys({
    loginName: Joi.string().trim().required(),//用户名
    password: Joi.string().trim().required(),//密码
    setDlNumber: Joi.number().required(),//设备下载量
    remark: Joi.string().trim(),//描述
    role: Joi.string().trim(),//角色
})

/**
 * 获取用户数据统计表
 */
export const getStatisticsListMap = Joi.object().keys({
    user: Joi.string().trim().required(),//用户名
})

/**
 * 用户某月数据
 */
export const getOneMonthDataMap = Joi.object().keys({
    userName: Joi.string().trim(),//用户名
    startTime: Joi.number().required(),//开始时间
    endTime: Joi.number().required(),//结束时间
})