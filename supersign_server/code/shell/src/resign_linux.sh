#!/usr/bin/env bash
echo "签名启动时间 " $(date "+%M:%S")
error() {
    echo "$@" >&2
    exit 1
}

warning() {
    echo "$@" >&2
}

checkStatus() {
    # shellcheck disable=SC2181
    if [ $? -ne 0 ]; then
        echo "Encountered an error, has been aborted, the error code is: $1"
        exit $1
    fi
}

ORIGINAL_FILE="$1"
CERTIFICATE="$2"
BUNDLE_IDENTIFIER=""
RAW_PROVISIONS=()
PROVISIONS_BY_ID=()
DEFAULT_PROVISION=""
TEMP_DIR="_floatsignTemp"

# options start index
shift 2

# Parse args
while [ "$1" != "" ]; do
    case $1 in
    -p | --provisioning)
        shift
        RAW_PROVISIONS+=("$1")
        ;;
    -n | --provisioning)
        shift
        TEMP_DIR=("$1")
        ;;
    -m | --provisioning)
        shift
        MULTI_TARGET=("$1")
        ;;
    *)
        [[ -n "$NEW_FILE" ]] && error "Multiple output file names specified!"
        [[ -z "$NEW_FILE" ]] && NEW_FILE="$1"
        ;;
    esac

    # Next arg
    shift
done

# Check output file name
if [ -z "$NEW_FILE" ]; then
    error "Output file name required"
fi

if [[ "${#RAW_PROVISIONS[*]}" == "0" ]]; then
    error "-p 'xxxx.mobileprovision' argument is required"
fi

TEMP_DIR=$(dirname $ORIGINAL_FILE)/$TEMP_DIR
# Check for and remove the temporary directory if it already exists
if [ -d "$TEMP_DIR" ]; then
    rm -Rf "$TEMP_DIR"
fi

filename=$(basename "$ORIGINAL_FILE")
extension="${filename##*.}"
filename="${filename%.*}"

# Check if the supplied file is an ipa or an app file
if [ "${extension}" = "ipa" ]; then
    # Unzip the old ipa quietly
    unzip -q "$ORIGINAL_FILE" -d $TEMP_DIR
    checkStatus 138
elif [ "${extension}" = "app" ]; then
    # Copy the app file into an ipa-like structure
    mkdir -p "$(find -d $TEMP_DIR -name "Payload")"
    cp -Rf "${ORIGINAL_FILE}" "$(find -d $TEMP_DIR -name "Payload")/${filename}.app"
    checkStatus 137
else
    error "Error: Only can resign .app files and .ipa files."
fi

# Set the app name
APP_NAME=$(ls "$(find -d $TEMP_DIR -name "Payload")/" | grep ".app$" | head -1)

export PATH=$PATH:/usr/libexec

# Test whether two bundle identifiers match
# The first one may contain the wildcard character '*', in which case pattern matching will be used unless the third parameter is "STRICT"
does_bundle_id_match() {

    # shellcheck disable=SC2049
    if [[ "$1" == "$2" ]]; then
        return 0
    elif [[ "$3" != STRICT && "$1" =~ \* ]]; then
        local PATTERN0="${1//\./\\.}"       # com.example.*     -> com\.example\.*
        local PATTERN1="${PATTERN0//\*/.*}" # com\.example\.*   -> com\.example\..*
        if [[ "$2" =~ ^$PATTERN1$ ]]; then
            return 0
        fi
    fi

    return 1
}

# Find the provisioning profile for a given bundle identifier
provision_for_bundle_id() {

    for ARG in "${PROVISIONS_BY_ID[@]}"; do
        if does_bundle_id_match "${ARG%%=*}" "$1" "$2"; then
            echo "${ARG#*=}"
            break
        fi
    done
}

# Find the bundle identifier contained inside a provisioning profile
function bundle_id_for_provison() {

    local FULL_BUNDLE_ID=$(PlistBuddy -c 'Print :Entitlements:application-identifier' /dev/stdin <<<"$(security cms -D -i "$1")")
    checkStatus 136
    echo "${FULL_BUNDLE_ID#*.}"
}

# Add given provisioning profile and bundle identifier to the search list
add_provision_for_bundle_id() {

    local PROVISION="$1"
    local BUNDLE_ID="$2"

    local CURRENT_PROVISION=$(provision_for_bundle_id "$BUNDLE_ID" STRICT)

    if [[ "$CURRENT_PROVISION" != "" && "$CURRENT_PROVISION" != "$PROVISION" ]]; then
        error "Conflicting provisioning profiles '$PROVISION' and '$CURRENT_PROVISION' for bundle identifier '$BUNDLE_ID'."
    fi

    PROVISIONS_BY_ID+=("$BUNDLE_ID=$PROVISION")
}

# Add given provisioning profile to the search list
add_provision() {

    local PROVISION="$1"

    if [[ "$1" =~ .+=.+ ]]; then
        PROVISION="${1#*=}"
        add_provision_for_bundle_id "$PROVISION" "${1%%=*}"
    elif [[ "$DEFAULT_PROVISION" == "" ]]; then
        DEFAULT_PROVISION="$PROVISION"
    fi

    if [[ ! -e "$PROVISION" ]]; then
        error "Provisioning profile '$PROVISION' file does not exist"
    fi

    local BUNDLE_ID=$(bundle_id_for_provison "$PROVISION")
    add_provision_for_bundle_id "$PROVISION" "$BUNDLE_ID"
}

# Load bundle identifiers from provisioning profiles
for ARG in "${RAW_PROVISIONS[@]}"; do
    add_provision "$ARG"
done

# Resign the given application
resign() {
    local APP_PATH="$1"
    local NESTED="$2"
    local BUNDLE_IDENTIFIER="$BUNDLE_IDENTIFIER"
    local NEW_PROVISION="$NEW_PROVISION"

    if [[ "$NESTED" == NESTED ]]; then
        # Ignore bundle identifier for nested applications
        BUNDLE_IDENTIFIER=""
    fi

    # 单独app中包含Info.plist
    if [ ! -e "$APP_PATH/Info.plist" ]; then
        error "Expected file does not exist: '$APP_PATH/Info.plist'"
    fi

    # 获取bundleID
    local CURRENT_BUNDLE_IDENTIFIER=$(python3 $(dirname $0)/readPlist.py "$APP_PATH/Info.plist" "CFBundleIdentifier")
    local NEW_PROVISION=$(provision_for_bundle_id "${BUNDLE_IDENTIFIER:-$CURRENT_BUNDLE_IDENTIFIER}")

    if [[ "$NEW_PROVISION" == "" && "$NESTED" != NESTED ]]; then
        NEW_PROVISION="$DEFAULT_PROVISION"
    fi

    if [[ "$NEW_PROVISION" == "" ]]; then
        error "Use the -p option (example: -p com.example.app=xxxx.mobileprovision)"
    fi

    local PROVISION_BUNDLE_IDENTIFIER=$(bundle_id_for_provison "$NEW_PROVISION")

    # Use provisioning profile's bundle identifier
    if [ "$BUNDLE_IDENTIFIER" == "" ]; then
        # shellcheck disable=SC2049
        if [[ "$PROVISION_BUNDLE_IDENTIFIER" =~ \* ]]; then
            BUNDLE_IDENTIFIER="$CURRENT_BUNDLE_IDENTIFIER"
        else
            BUNDLE_IDENTIFIER="$PROVISION_BUNDLE_IDENTIFIER"
        fi
    fi

    # 描述文件转plist文件
    python3 "$(dirname $0)/mobileprovision2plist.py" "$NEW_PROVISION" >"$TEMP_DIR/profile.plist"
    checkStatus 135

    # 复制描述文件
    if [ -f "$APP_PATH/embedded.mobileprovision" ]; then
        cp -f "$NEW_PROVISION" "$APP_PATH/embedded.mobileprovision"
    fi

    # 修改bundleID
    if [[ "$CURRENT_BUNDLE_IDENTIFIER" != "$BUNDLE_IDENTIFIER" && $MULTI_TARGET != "0" ]]; then
        echo "target数量： $MULTI_TARGET"
        python3 $(dirname $0)/readPlist.py "$APP_PATH/Info.plist" 'CFBundleIdentifier' -s "${BUNDLE_IDENTIFIER}" >/dev/null 2>&1
        checkStatus 134
    fi

    # 从描述文件中提取签名所需要的文件
    EntitlementsData=$(python3 $(dirname $0)/readPlist.py "$TEMP_DIR/profile.plist" 'Entitlements' -x)
    echo $EntitlementsData >"$TEMP_DIR/newEntitlements.plist"
    checkStatus 133

    cp -- "$TEMP_DIR/newEntitlements.plist" "$APP_PATH/archived-expanded-entitlements.xcent"

    # 把com.apple.developer.icloud-services的*值改为CloudKit
    if [ "$APP_PATH" = "$(find -d $TEMP_DIR -name "Payload")/Hiha.app" ]; then
        python3 "$(dirname $0)/mobileprovision2plist.py" "$TEMP_DIR/newEntitlements.plist" "icloud"
    fi

    # 真正的签名
    PASSWORD=$(cat "$HOME/SuperSign/dist/config/PWD")
    security set-key-partition-list -S apple-tool:,apple: -s -k "$PASSWORD" "/Users/$USER/Library/Keychains/login.keychain-db" >/dev/null 2>&1
    checkStatus 132
    /usr/bin/codesign -f -s "$CERTIFICATE" --entitlements "$TEMP_DIR/newEntitlements.plist" "$APP_PATH"
    checkStatus 131

    # 删除临时文件
    rm -f "$TEMP_DIR/profile.plist"
    rm -f "$TEMP_DIR/newEntitlements.plist"
}

# 遍历所有需要重签名的组件
resignPaths=$(find "$(find -d $TEMP_DIR -name "Payload")/$APP_NAME" -d -name *.app -o -name *.framework -o -name *.dylib -o -name *.appex)
# 设置以'\n‘作为分隔符，否则遍历文件夹过程中，路径遇到空格会出问题
IFS=$'\n'
set -f
for app in ${resignPaths}; do
    if ([ -e "$app" ]); then
        # echo "正在签名：$app"
        if [[ $app =~ ".framework" || $app =~ ".dylib" ]]; then
            if [ -f "$app/_CodeSignature" ]; then
                rm -rf $app/_CodeSignature
            fi
            codesign -fs $CERTIFICATE $app >/dev/null 2>&1
        else
            resign "$app" NESTED
        fi
    fi
done

# 最后最app本身进行签名
resign "$(find -d $TEMP_DIR -name "Payload")/$APP_NAME"

if [ "$TEMP_DIR" != "$(
    cd $(find -d $TEMP_DIR -name "Payload")/../
    pwd
)" ]; then
    mv "$(find -d $TEMP_DIR -name "Payload")/" "$(find -d $TEMP_DIR -name "Payload")/../../"
fi

# 压缩
pushd "$TEMP_DIR" >/dev/null 2>&1
zip -qry "$TEMP_DIR.ipa" . -i *
popd >/dev/null 2>&1

# 重命名
mv "$TEMP_DIR.ipa" "$NEW_FILE"

# 删除临时文件
rm -rf "$TEMP_DIR"

echo "\n重签名完成！"
echo "签名结束时间 " $(date "+%M:%S")
