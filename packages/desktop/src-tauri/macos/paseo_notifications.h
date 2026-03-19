#import <stdbool.h>

typedef void (*PaseoNotificationClickCallback)(const char* payload_json);

bool paseo_notifications_initialize(PaseoNotificationClickCallback callback, char** error_out);
bool paseo_notifications_send(
    const char* title,
    const char* body,
    const char* payload_json,
    char** error_out
);
void paseo_notifications_free_string(char* value);
