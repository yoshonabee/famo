//go:build darwin && !ios

package desktop

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Foundation -framework ServiceManagement
#import <Foundation/Foundation.h>
#import <ServiceManagement/ServiceManagement.h>

static const NSInteger FamoLoginItemUnavailable = -1;

static NSInteger famoLoginItemStatus(void) {
	@autoreleasepool {
		if (@available(macOS 13.0, *)) {
			NSBundle *bundle = NSBundle.mainBundle;
			if (bundle.bundleIdentifier != nil &&
			    [bundle.bundleURL.pathExtension caseInsensitiveCompare:@"app"] == NSOrderedSame) {
				return SMAppService.mainAppService.status;
			}
		}
		return FamoLoginItemUnavailable;
	}
}

static void famoSetLoginItem(int enabled) {
	@autoreleasepool {
		if (@available(macOS 13.0, *)) {
			SMAppService *service = SMAppService.mainAppService;
			NSError *error = nil;
			BOOL success = enabled ? [service registerAndReturnError:&error]
			                       : [service unregisterAndReturnError:&error];
			if (!success) {
				NSLog(@"Could not change Famo login item: %@", error);
			}
		}
	}
}

static void famoOpenLoginItemSettings(void) {
	if (@available(macOS 13.0, *)) {
		[SMAppService openSystemSettingsLoginItems];
	}
}
*/
import "C"

import (
	"errors"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type LoginItem struct {
	mu sync.Mutex
}

type loginItemStatus string

const (
	loginItemOff              loginItemStatus = "off"
	loginItemOn               loginItemStatus = "on"
	loginItemRequiresApproval loginItemStatus = "requiresApproval"
	loginItemUnavailable      loginItemStatus = "unavailable"
)

func (item *LoginItem) Status() loginItemStatus {
	item.mu.Lock()
	defer item.mu.Unlock()
	return currentLoginItemStatus()
}

func (item *LoginItem) SetEnabled(enabled bool) error {
	item.mu.Lock()
	defer item.mu.Unlock()

	status := currentLoginItemStatus()
	if status == loginItemUnavailable {
		return errors.New("login item is unavailable")
	}
	if (status != loginItemOff) == enabled {
		return nil
	}

	value := C.int(0)
	if enabled {
		value = 1
	}
	C.famoSetLoginItem(value)
	status = currentLoginItemStatus()
	if enabled && (status == loginItemOn || status == loginItemRequiresApproval) ||
		!enabled && status == loginItemOff {
		return nil
	}
	return errors.New("macOS did not apply the login item change")
}

func (item *LoginItem) OpenSettings() {
	application.InvokeSync(func() { C.famoOpenLoginItemSettings() })
}

func currentLoginItemStatus() loginItemStatus {
	switch C.famoLoginItemStatus() {
	// A fresh app can have no login item record yet.
	case C.SMAppServiceStatusNotRegistered, C.SMAppServiceStatusNotFound:
		return loginItemOff
	case C.SMAppServiceStatusEnabled:
		return loginItemOn
	case C.SMAppServiceStatusRequiresApproval:
		return loginItemRequiresApproval
	default:
		return loginItemUnavailable
	}
}
