#!/usr/bin/python3
# -*- coding: utf-8 -*
import os
import sys
import shutil
import plistlib
from io import StringIO
from addict import Dict
import re
import resign


class Analysis(object):
    """app包分析类
    通过解压原包来分析包中的信息，包括bundleId,插件bundleId,target数量,版本号

    公共属性：
        bundleIds:[],存储插件bundleId
        ipaName:包名，字符串类型
        payPath:包路径，字符串类型
        bundleRand:主bundleId后面随机加的字符串，用来与包原bundleId组合生成新bundleId
        bidDick:[]存储最终获取到的bundleId，
            数据结构：
            [
                {main:主bundleId,son:[插件后缀集合]},
                ...
            ]
        extentionsId = []存放插件bundleId后缀
        ipaName：包名（不带后缀
        payPath：包路径不带pid的路径（.../data/package/）
        user：苹果账号
        pwd：苹果账号密码
        shellPath：脚本文件夹路径
    """

    def __init__(self, ipaName=None, payPath=None, user=None, pwd=None, shellPath=None):
        """初始化公共属性"""
        self.ipaName = ipaName
        self.payPath = payPath
        self.user = user
        self.pwd = pwd
        self.shellPath = shellPath
        self.bundleIds = []
        self.bidDick = []
        self.bundleRand = ""
        self.extentionsId = []

    def load_plistlib(self, plist_path):
        """读取Info.plist文件数据
        参数：
            plist_path:plist文件

        返回值：
            plist文件数据
        """
        plist = open(plist_path, "rb").read()
        plist_data = plistlib.loads(plist)
        return plist_data

    def handleAppex(self, pPath):
        """获得插件bundleId
        参数：
            pPath:插件根目录
        """

        """CFBundleIdentifier:Info.plist文件中bundleId所对应的key值"""
        key = "CFBundleIdentifier"
        for root, dirs, files in os.walk(pPath):
            for k in files:
                file = os.path.join(root, k)
                idx = file.find("Info.plist")
                if(idx > -1):
                    plist_data = self.load_plistlib(file)
                    if key in plist_data:
                        """通过key值，从plist数据中将bundleId取出"""
                        bundleId = plist_data[key]
                        self.bundleIds.append(bundleId)

    def handleMainInfoPlist(self):  # Bundle identifier
        """获得包主bundleId
        返回值：
            包主bundleId值
        """
        """CFBundleIdentifier:Info.plist文件中bundleId所对应的key值"""
        key = "CFBundleIdentifier"
        for root, dirs, files in os.walk(self.payPath):
            """.app原包后缀名，根据它确定要搜索的路径"""
            pex = ".app"
            index = root.find(pex)
            length = len(root)
            if(index > -1 and (length == (index+len(pex)))):  # find son app count
                pth = '%s%s' % (root, '/Info.plist')
                plist_data = self.load_plistlib(pth)
                """通过key值，从plist数据中将bundleId取出"""
                mBid = plist_data[key]
                mainBunledId = mBid
                return mainBunledId

    def getCFBundleShortVersionString(self):  # version
        """从包中获取版本号
        返回值：
            版本号
        """
        """CFBundleShortVersionString:Info.plist文件中版本号所对应的key值"""
        key = "CFBundleShortVersionString"
        for root, dirs, files in os.walk(self.payPath):
            """.app原包后缀名，根据它确定要搜索的路径"""
            pex = ".app"
            index = root.find(pex)
            length = len(root)
            if(index > -1 and (length == (index+len(pex)))):  # find son app count
                pth = '%s%s' % (root, '/Info.plist')
                plist_data = self.load_plistlib(pth)
                """通过key值，从plist数据中将版本号取出"""
                version = plist_data[key]
                return version

    def getExtentions(self):
        """封装从包中分析出来的bundleId
        数据结构：
            [
                {main:主bundleId,son:[插件后缀集合]},
                ...
            ]
        """
        mainBunledId = self.handleMainInfoPlist()
        bidItem = {"main": '%s%s' % (mainBunledId, self.bundleRand), "son": []}
        for bid in self.bundleIds:
            idx = bid.find(mainBunledId)
            if(idx > -1):
                """extentions:插件中bundleId的后缀名,如.sharde"""
                extentions = bid[len(mainBunledId)+1:len(bid)]
                self.extentionsId.append(extentions)
                bidItem["son"].append(extentions)
        self.bidDick.append(bidItem)

    def startSearchCount(self):
        """遍历解压文件夹，查找插件"""
        self.bundleIds = []
        for root, dirs, files in os.walk(self.payPath):
            """.appex插件后缀名，根据它确定要搜索的路径"""
            pex = ".appex"
            index = root.find(pex)
            length = len(root)
            if(index > -1 and (length == (index+len(pex)))):  # find son app count
                self.handleAppex(root)
        self.getExtentions()

    def unzipPackage(self, pid, bundleRand, isfirst, basePath=None):
        """解压app
        参数：
            pid:应用pid，用来查找待解压包路径的参数
            bundleRand:主bundleId后面随机加的字符串，用来与包原bundleId组合生成新bundleId
            isfirst:布尔值,只有在传包的时候重新解压，否则不用再次重复解压
        """
        if basePath:
            self.payPath = basePath
        self.bundleRand = bundleRand
        rootIpa = '%s%s' % (self.payPath, pid)
        self.payPath = '%s%s' % (rootIpa, '/temp')
        isExists = os.path.exists(self.payPath)
        temp = self.payPath
        if(isExists and isfirst):
            os.system("rm -r %s" % (self.payPath))

        isExists = os.path.exists(self.payPath)
        if(not isExists):
            os.mkdir(temp)
            command = "unzip -q %s/%s.ipa -d %s" % (
                rootIpa, self.ipaName, self.payPath)
            os.system(command)
        self.startSearchCount()

    def analysisCreateBundleId(self, pidBdArr, basePath):
        """分析包创建bundleId函数
        参数：
            pidBdArr:[],应用包pid和构造bundleId的随机字符串数组,[pid,bd,pid,bd,...]
                        单个包和多个包通用
        """
        for i in range(0, len(pidBdArr)):
            t = i % 2
            if(t == 1):
                self.unzipPackage(pidBdArr[i-1], pidBdArr[i], True, basePath)

        """存放构造好的bundleId"""
        result = []
        dicklen = len(self.bidDick)
        for j in range(0, dicklen):
            item = self.bidDick[j]
            main = item["main"]
            head = "-findhead-"
            result.append('%s%s' % (head, main))
            for k in item["son"]:
                result.append('%s%s%s' % (main, '.', k))

        """执行命令，通过create_bundleId.rb创建bundleId"""
        commands = "ruby %s/create_bundleId.rb %s %s " % (
            self.shellPath, self.user, self.pwd)
        for k in result:
            commands += " %s " % (k)
        print(commands)
        code = os.system(commands) >> 8
        sys.exit(code)

    def analysisCreateProfile(self, filePath, randBund, uname, udid, pid):
        """分析包并创建描述文件
        参数：
            filePath:描述文件存放路径
            randBund:主bundleId后面随机加的字符串，用来与包原bundleId组合生成新bundleId
            uname:注册设备名字
            udid:设备udid
            pid:应用pid，用来查找待解压包路径的参数
        """
        self.unzipPackage(pid, randBund, False)
        mainBunledId = self.handleMainInfoPlist()
        bundleid = '%s%s' % (mainBunledId, randBund)
        """执行命令，通过registerDeviceID.rb注册设备并创建描述文件"""
        commands = "ruby %s/registerDeviceID.rb %s %s %s %s %s %s " % (
            self.shellPath, self.user, self.pwd, uname, udid, bundleid, filePath)
        for idx in range(len(self.extentionsId)):
            commands += " %s " % (self.extentionsId[idx])
        print(commands)
        codeNum = os.system(commands) >> 8
        sys.exit(codeNum)

    def analysisResignApp(self, randBund, p12Path, ipaPath, outSignedPath, udid, pid):
        """分析包并重签名
        参数：
            randBund:主bundleId后面随机加的字符串，用来与包原bundleId组合生成新bundleId
            p12Path：p12文件路径
            ipaPath：ipa包路径
            outSignedPath：重签名后的包输出路径
            udid：设备udid
            pid：应用pid，用来查找待解压包路径的参数
        """
        self.unzipPackage(pid, randBund, False)
        mainBunledId = self.handleMainInfoPlist()
        bundleid = "%s%s" % (mainBunledId, randBund)
        paramsarr = [self.shellPath, mainBunledId, bundleid,
                     ipaPath, outSignedPath, p12Path, self.extentionsId, udid]

        code = resign.startResign(paramsarr)
        print("签名脚本执行code： %s" % code)
        sys.exit(code)

    def analysisGetTargetsAndVersion(self, pid):
        """获取包中target数量、版本号信息及主bunleID
        参数：
            pid：应用pid，用来查找待解压包路径的参数
        """
        self.unzipPackage(pid, "", True)
        version = self.getCFBundleShortVersionString()
        mainBunledId = self.handleMainInfoPlist()
        extentions = ",".join(self.extentionsId)
        """ts中需要在这样的输出日志中获得对应的指，这几行日志输出不能省略"""
        print('{"target":"%s", "mainBid":"%s", "version":"%s","extentions":"%s"}' %
              (str(len(self.extentionsId)), mainBunledId, str(version), extentions))


if __name__ == '__main__':
    order = sys.argv[1]
    if order == "1":
        """创建bundleId"""
        analysis = Analysis(sys.argv[2], sys.argv[3],
                            sys.argv[4], sys.argv[5], sys.argv[6])
        arr = []
        for i in range(7, len(sys.argv)):
            arr.append(sys.argv[i])
        analysis.analysisCreateBundleId(arr, sys.argv[3])
    elif order == "2":
        """创建描述文件"""
        analysis = Analysis(sys.argv[2], sys.argv[3],
                            sys.argv[4], sys.argv[5], sys.argv[6])
        analysis.analysisCreateProfile(
            sys.argv[7], sys.argv[8], sys.argv[9], sys.argv[10], sys.argv[11])
    elif order == "3":
        """签名"""
        analysis = Analysis("", sys.argv[2], "", "", sys.argv[3])
        analysis.analysisResignApp(
            sys.argv[4], sys.argv[5], sys.argv[6], sys.argv[7], sys.argv[8], sys.argv[9])
    elif order == "4":
        """获取包中target数量和版本号信息"""
        ipaName = sys.argv[2]
        packageDir = sys.argv[3]
        pid = sys.argv[4]
        analysis = Analysis(ipaName, packageDir)
        analysis.analysisGetTargetsAndVersion(pid)
