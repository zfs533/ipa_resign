# -*- coding: utf-8 -*
import os
import re


def get_cert_name(p12):
    """
    获取证书名称
    先把p12转成pem，在从pem中提取出合适的名字，最后删除pem
    """
    tpm = "chmod 600 %s \nopenssl pkcs12 -in %s -out cert.pem -clcerts -nokeys -password pass:123>/dev/null 2>&1" % (
        p12, p12)
    result = os.system(tpm)
    if(result == 0):
        info = os.popen("openssl x509 -in cert.pem -noout -subject").read()
        # os.system("rm -rf cert.pem")
        return "iPhone" + re.findall(r'iPhone([^\)]+)', info)[0] + ")"


def startResign(paramarr):
    shellPath = paramarr[0]
    mainBunledId = paramarr[1]
    bundleid = paramarr[2]
    ipaPath = paramarr[3]
    outSignedPath = paramarr[4]
    pPath = paramarr[5]
    extentionsId = paramarr[6]
    udid = paramarr[7]
    is_multi_target = len(extentionsId)
    print("---------resign.py---------")
    ipaPath = ipaPath
    outPath = outSignedPath
    p12Path = pPath + "p12.p12"
    shellPath = shellPath + "/src/resign_linux.sh"
    cert_name = get_cert_name(p12Path)
    print("certname:"+cert_name)

    command = ""
    pp = pPath+bundleid+udid+".mobileprovision"
    command = "sh"+" "+shellPath+" "+ipaPath+" \"" + \
        cert_name+"\" -p"+" " + mainBunledId+"="+pp
    for idx in range(len(extentionsId)):
        print(extentionsId[idx])
        ppx = pPath+bundleid+"."+extentionsId[idx]+udid+".mobileprovision"
        command += ""+" -p " + mainBunledId+"."+extentionsId[idx]+"="+ppx+" "
    command += " "+outPath + " -n " + udid + " -m " + str(is_multi_target)
    print(command)
    code = os.system(command) >> 8
    return code
