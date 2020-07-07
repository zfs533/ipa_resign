puts "设备数启动时间 : " + Time.new.strftime("%M:%S")
require 'spaceship'

def login(user, pwd)
    Spaceship::Portal.login(user, pwd)

    rescue Exception => e
    message = "#{e.class.name}: #{e.message}"
    say message
    exit 2
end

def getDeviceCount()
    all_devices = Spaceship::Portal.device.all
    # puts "getbegin#{all_devices.size}getend"
    puts "count: #{all_devices.size}"
end

def main(argv)
    user = argv[0]
    pwd  = argv[1]
    login(user, pwd)
    getDeviceCount()
end

main(ARGV)

puts "设备数结束时间 : " + Time.new.strftime("%M:%S")
