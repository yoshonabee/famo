//go:build darwin && !ios

package desktop

/*
#cgo LDFLAGS: -framework CoreFoundation -framework Security
#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>

static CFMutableDictionaryRef famo_drive_query(void) {
	CFMutableDictionaryRef query = CFDictionaryCreateMutable(
		kCFAllocatorDefault, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
	CFDictionarySetValue(query, kSecClass, kSecClassGenericPassword);
	CFDictionarySetValue(query, kSecAttrService, CFSTR("io.github.yoshonabee.famo.google-drive"));
	CFDictionarySetValue(query, kSecAttrAccount, CFSTR("google-drive-backup"));
	return query;
}

static OSStatus famo_drive_load(CFDataRef *data) {
	CFMutableDictionaryRef query = famo_drive_query();
	CFDictionarySetValue(query, kSecReturnData, kCFBooleanTrue);
	CFDictionarySetValue(query, kSecMatchLimit, kSecMatchLimitOne);
	CFTypeRef result = NULL;
	OSStatus status = SecItemCopyMatching(query, &result);
	CFRelease(query);
	if (status == errSecSuccess) {
		*data = (CFDataRef)result;
	}
	return status;
}

static OSStatus famo_drive_save(const UInt8 *bytes, CFIndex size) {
	CFDataRef data = CFDataCreate(kCFAllocatorDefault, bytes, size);
	CFMutableDictionaryRef query = famo_drive_query();
	const void *keys[] = {kSecValueData};
	const void *values[] = {data};
	CFDictionaryRef update = CFDictionaryCreate(kCFAllocatorDefault, keys, values, 1,
		&kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
	OSStatus status = SecItemUpdate(query, update);
	if (status == errSecItemNotFound) {
		CFDictionarySetValue(query, kSecValueData, data);
		CFDictionarySetValue(query, kSecAttrLabel, CFSTR("Famo Google Drive"));
		status = SecItemAdd(query, NULL);
	}
	CFRelease(update);
	CFRelease(query);
	CFRelease(data);
	return status;
}

static OSStatus famo_drive_remove(void) {
	CFMutableDictionaryRef query = famo_drive_query();
	OSStatus status = SecItemDelete(query);
	CFRelease(query);
	return status;
}
*/
import "C"

import (
	"encoding/json"
	"errors"
	"fmt"
	"unsafe"
)

func loadDriveCredentials() (driveCredentials, error) {
	var data C.CFDataRef
	status := C.famo_drive_load(&data)
	if status == C.errSecItemNotFound {
		return driveCredentials{}, nil
	}
	if status != C.errSecSuccess {
		return driveCredentials{}, fmt.Errorf("無法讀取鑰匙圈中的 Google Drive 授權（%d）", status)
	}
	defer C.CFRelease(C.CFTypeRef(data))
	invalid := errors.New("鑰匙圈中的 Google Drive 授權無效，請重新授權")
	size := C.CFDataGetLength(data)
	if size <= 0 || size > driveJSONLimit {
		return driveCredentials{}, invalid
	}
	raw := C.GoBytes(unsafe.Pointer(C.CFDataGetBytePtr(data)), C.int(size))
	var credentials driveCredentials
	if err := json.Unmarshal(raw, &credentials); err != nil || !driveClientID.MatchString(credentials.ClientID) || credentials.RefreshToken == "" {
		return driveCredentials{}, invalid
	}
	return credentials, nil
}

func saveDriveCredentials(credentials driveCredentials) error {
	raw, err := json.Marshal(credentials)
	if err != nil {
		return err
	}
	if len(raw) > driveJSONLimit {
		return errors.New("Google Drive 授權資料過大")
	}
	if status := C.famo_drive_save((*C.UInt8)(unsafe.Pointer(unsafe.SliceData(raw))), C.CFIndex(len(raw))); status != C.errSecSuccess {
		return fmt.Errorf("無法將 Google Drive 授權儲存至鑰匙圈（%d）", status)
	}
	return nil
}

func clearDriveCredentials() error {
	status := C.famo_drive_remove()
	if status != C.errSecSuccess && status != C.errSecItemNotFound {
		return fmt.Errorf("無法從鑰匙圈移除 Google Drive 授權（%d）", status)
	}
	return nil
}
