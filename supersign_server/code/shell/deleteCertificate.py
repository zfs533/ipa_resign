# -*- coding: utf-8 -*
import sys
import os

#"iPhone Developer: Osmond Grace (QMX66TZQUP)"
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
        start = info.find("CN=")
        end= info.find("OU")
        result = info[start+3:end-1]
        return result

if __name__ == '__main__':
    p12Path = sys.argv[1] +"/p12.p12"
    cert_name = get_cert_name(p12Path)
    index = cert_name.find(":")
    cert = cert_name[index+2:len(cert_name)]
    cert = cert.replace("(","（")
    cert = cert.replace(")","）")
    print(cert_name)
    print(cert)

    command = "security delete-certificate -c "+ cert +" $HOME/Library/Keychains/login.keychain-db"
    os.system(command)
