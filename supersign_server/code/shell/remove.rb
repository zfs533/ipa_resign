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

def rmove_bundle_id()
    all_apps = Spaceship::Portal.app.all
    all_groups = Spaceship::Portal.app_group.all

    Parallel.map(all_apps, in_threads: 12) do |app|
        puts app.bundle_id
        app.delete!
    end
    Parallel.map(all_groups, in_threads: 12) do |app|
        puts app.group_id
        puts app.delete!
    end


    rescue Exception => e
    message = "#{e.class.name}: #{e.message}"
    say message
    exit 2
end

def main(argv)
    user=argv[0]
    pwd=argv[1]

    login(user, pwd)
    rmove_bundle_id()
end

main(ARGV)