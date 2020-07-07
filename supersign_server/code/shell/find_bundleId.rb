require 'spaceship'
require 'parallel'

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


def main(argv)
    puts "--------------findBundleId.rb-------------"
    user=argv[0]
    pwd=argv[1]
    puts "user     : #{user}","password : #{pwd}"
    login(user, pwd)

    Spaceship::Portal.app.all.each do |app|
        puts app.bundle_id
    end
end

main(ARGV)