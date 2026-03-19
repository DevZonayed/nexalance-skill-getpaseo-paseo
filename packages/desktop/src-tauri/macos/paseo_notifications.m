#import "paseo_notifications.h"

#import <dispatch/dispatch.h>
#import <Foundation/Foundation.h>
#import <UserNotifications/UserNotifications.h>

@interface PaseoNotificationDelegate : NSObject <UNUserNotificationCenterDelegate>
@property(nonatomic, assign) PaseoNotificationClickCallback clickCallback;
@end

@implementation PaseoNotificationDelegate

- (void)userNotificationCenter:(UNUserNotificationCenter*)center
       didReceiveNotificationResponse:(UNNotificationResponse*)response
                withCompletionHandler:(void (^)(void))completionHandler {
    if ([response.actionIdentifier isEqualToString:UNNotificationDefaultActionIdentifier] &&
        self.clickCallback != NULL) {
        id payload = response.notification.request.content.userInfo[@"paseoPayloadJson"];
        if ([payload isKindOfClass:[NSString class]]) {
            self.clickCallback([(NSString*)payload UTF8String]);
        } else {
            self.clickCallback(NULL);
        }
    }

    [center removeDeliveredNotificationsWithIdentifiers:@[
        response.notification.request.identifier,
    ]];
    completionHandler();
}

- (void)userNotificationCenter:(UNUserNotificationCenter*)center
      willPresentNotification:(UNNotification*)notification
        withCompletionHandler:
            (void (^)(UNNotificationPresentationOptions options))completionHandler {
    if (@available(macOS 11.0, *)) {
        completionHandler(
            UNNotificationPresentationOptionBanner | UNNotificationPresentationOptionList
        );
        return;
    }

    completionHandler((UNNotificationPresentationOptions)0);
}

@end

static PaseoNotificationDelegate* paseoNotificationDelegate = nil;
static BOOL paseoNotificationsAvailable = NO;

static void paseo_run_on_main_sync(dispatch_block_t block) {
    if ([NSThread isMainThread]) {
        block();
        return;
    }

    dispatch_sync(dispatch_get_main_queue(), block);
}

static char* paseo_strdup(NSString* value) {
    if (value == nil) {
        return NULL;
    }

    const char* utf8 = [value UTF8String];
    if (utf8 == NULL) {
        return NULL;
    }

    size_t length = strlen(utf8);
    char* buffer = malloc(length + 1);
    if (buffer == NULL) {
        return NULL;
    }

    memcpy(buffer, utf8, length + 1);
    return buffer;
}

static BOOL paseo_is_bundled_app_host(void) {
    NSURL* bundleURL = [[NSBundle mainBundle] bundleURL];
    NSString* pathExtension = [[bundleURL pathExtension] lowercaseString];
    return [pathExtension isEqualToString:@"app"];
}

bool paseo_notifications_initialize(PaseoNotificationClickCallback callback, char** error_out) {
    @autoreleasepool {
        paseo_run_on_main_sync(^{
          if (paseoNotificationDelegate == nil) {
              paseoNotificationDelegate = [[PaseoNotificationDelegate alloc] init];
              paseoNotificationsAvailable = paseo_is_bundled_app_host();
              if (paseoNotificationsAvailable) {
                  [[UNUserNotificationCenter currentNotificationCenter]
                      setDelegate:paseoNotificationDelegate];
              }
          }

          paseoNotificationDelegate.clickCallback = callback;
        });

        if (error_out != NULL) {
            *error_out = NULL;
        }
        return true;
    }
}

bool paseo_notifications_send(
    const char* title,
    const char* body,
    const char* payload_json,
    char** error_out
) {
    @autoreleasepool {
        if (paseoNotificationDelegate == nil) {
            if (error_out != NULL) {
                *error_out = paseo_strdup(@"Notification bridge is not initialized.");
            }
            return false;
        }

        if (!paseoNotificationsAvailable) {
            if (error_out != NULL) {
                *error_out = NULL;
            }
            return true;
        }

        NSString* notificationTitle =
            [NSString stringWithUTF8String:(title != NULL ? title : "")];
        NSString* notificationBody =
            (body != NULL && body[0] != '\0') ? [NSString stringWithUTF8String:body] : nil;
        NSString* payloadString =
            (payload_json != NULL && payload_json[0] != '\0')
                ? [NSString stringWithUTF8String:payload_json]
                : nil;
        NSString* identifier = [[NSUUID UUID] UUIDString];

        dispatch_async(dispatch_get_main_queue(), ^{
          UNMutableNotificationContent* content = [[UNMutableNotificationContent alloc] init];
          content.title = notificationTitle;
          if (notificationBody != nil) {
              content.body = notificationBody;
          }
          if (payloadString != nil) {
              content.userInfo = @{
                  @"paseoPayloadJson" : payloadString,
              };
          }

          UNNotificationRequest* request =
              [UNNotificationRequest requestWithIdentifier:identifier
                                                   content:content
                                                   trigger:nil];
          [[UNUserNotificationCenter currentNotificationCenter]
              addNotificationRequest:request
               withCompletionHandler:^(NSError* _Nullable error) {
                 if (error != nil) {
                     NSLog(@"[PaseoNotifications] Failed to schedule notification: %@",
                           error.localizedDescription);
                 }
               }];
        });

        if (error_out != NULL) {
            *error_out = NULL;
        }
        return true;
    }
}

void paseo_notifications_free_string(char* value) {
    if (value != NULL) {
        free(value);
    }
}
