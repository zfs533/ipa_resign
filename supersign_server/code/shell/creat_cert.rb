require 'spaceship'

$content
$yanzhengPath
$timeCount #最多等2分钟
def getYanZhenCode()
    aFile = File.new($yanzhengPath, "r")
    if aFile and $timeCount < 60 then
        $content = aFile.sysread(6)
        puts "#{$content} - #{$timeCount}"
        if $content.length != 6 then
            sleep(1)
            $timeCount = $timeCount+1
            getYanZhenCode()
        end
    else
        puts "failed to read file #{$yanzhengPath}"
        exit 1
    end
    aFile.close
    return $content
end

def login(user, pwd)
    $timeCount = 0
    aFile = File.new($yanzhengPath, "w")
    aFile.syswrite(1)
    aFile.close
    puts "开始登陆"
    spaceship = Spaceship::Portal.login(user, pwd, method(:getYanZhenCode))
    all_pla_warnings = spaceship.fetch_program_license_agreement_messages
    if all_pla_warnings.count > 0
        puts "有许可协议需要更新，正在接受许可协议"
        result = spaceship.accept_license_agreement_id
    end
    rescue Exception => e
    message = "#{e.class.name}: #{e.message}"
    say message
    exit 1
end

def createCertAndProfile(path)

    # 判断有没有证书，有则删除
    certificates = Spaceship::Portal.certificate.all
    for certificate in certificates
        certificate.revoke!
    end

    puts "正在创建.certSigningRequest文件及key文件"
    csr, pkey = Spaceship::Portal.certificate.create_certificate_signing_request

    puts "正在创建证书文件"
    cert=Spaceship::Portal.certificate.development.create!(csr: csr)

    puts "下载key文件"
    File.write("#{path}/pkey.key", pkey)

    puts "下载证书文件"
    File.write("#{path}/ios_distribution.cer", cert.download)

    puts "下载p12文件"
    exportP12(path, "#{path}/pkey.key", "#{path}/ios_distribution.cer")

    puts "安装p12"
    system "security unlock-keychain -p $(cat /Users/$USER/SuperSign/dist/config/PWD)  /Users/$USER/Library/Keychains/login.keychain-db"

    system "security import #{path}/p12.p12 -k /Users/$USER/Library/Keychains/login.keychain-db -P 123 -A -T /usr/bin/codesign" 
    return true

    rescue Exception => e
    message = "#{e.class.name}: #{e.message}"
    if message.include?"Your developer account needs to be updated.  Please visit Apple Developer Registration."  
        exit 7
    end
    puts message
    exit -1
end

# 导出p12
def exportP12(path, pkeyPath, certPath)
    certPath=File.expand_path("#{certPath}")
    pemPath=File.expand_path("#{path}/pem.pem")
    p12Path=File.expand_path("#{path}/p12.p12")
    system "cp #{certPath} #{pemPath}"
    system "openssl pkcs12 -export -inkey #{pkeyPath} -in #{pemPath} -out #{p12Path} -password pass:123"
    system "rm #{pemPath}"
    system "rm #{pkeyPath}"
    system "rm #{certPath}"

    rescue Exception => e
    message = "#{e.class.name}: #{e.message}"
    say message
    exit 2
end

def main(argv)
    user=argv[0]
    pwd=argv[1]
    path=argv[2]
    $yanzhengPath=argv[3]

    FileUtils.mkdir_p(path) unless File.exists?(path)
    login(user, pwd)

    createCertAndProfile(path)
end

main(ARGV)
