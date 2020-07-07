require 'spaceship'

def login(user, pwd)
    puts "开始登陆"
    spaceship = Spaceship::Portal.login(user, pwd)
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

def createCertAndProfile()
    # 判断有没有证书，有则删除
    dev_cert = Spaceship::Portal.certificate.development.all.first
    return dev_cert.owner_id
end

def main(argv)
    user=argv[0]
    pwd=argv[1]

    login(user, pwd)
    owner_id = createCertAndProfile()
    puts "{\"user\":\"#{user}\", \"owner_id\":\"#{owner_id}\"}"
end

main(ARGV)
