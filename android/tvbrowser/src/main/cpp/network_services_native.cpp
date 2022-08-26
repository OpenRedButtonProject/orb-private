/**
 * ORB Software. Copyright (c) 2022 Ocean Blue Software Limited
 *
 * Licensed under the ORB License that can be found in the LICENSE file at
 * the top level of this repository.
 */

#include <memory>
#include <android/log.h>

#include "media_synchroniser.h"
#include "CSSUtilities.h"
#include "jni_utils.h"
#include "log.h"

#define CB_START_TIMELINE_MONITORING 0
#define CB_STOP_TIMELINE_MONITORING 1
#define CB_DISPATCH_TIMELINE_AVAILABLE_EVENT 2
#define CB_DISPATCH_TIMELINE_UNAVAILABLE_EVENT 3
#define CB_GET_CURRENT_PTS_TIME 4
#define CB_GET_CURRENT_TEMI_TIME 5
#define CB_DISPATCH_INTER_DEVICE_SYNC_ENABLED 6
#define CB_DISPATCH_INTER_DEVICE_SYNC_DISABLED 7
#define CB_NUMBER_OF_ITEMS 8

static jmethodID gCb[CB_NUMBER_OF_ITEMS];

static jfieldID gJavaManagerPointerField;
static const char *TAG = "network_services_native";
static int gApp2AppServiceId = -1;

static NetworkServices::MediaSynchroniserManager* GetMediaSyncManagerHandle(JNIEnv *env, jobject object)
{
   return reinterpret_cast<NetworkServices::MediaSynchroniserManager *>(env->GetLongField(object,
      gJavaManagerPointerField));
}

static NetworkServices::MediaSynchroniser* GetActiveMediaSyncHandle(JNIEnv *env, jobject object)
{
   NetworkServices::MediaSynchroniserManager *ms = GetMediaSyncManagerHandle(env, object);
   if (ms != nullptr)
   {
      return ms->getActiveMediaSynchroniser();
   }
   return nullptr;
}

static NetworkServices::MediaSynchroniser* GetMediaSyncHandleById(JNIEnv *env, jobject object, jint id)
{
   NetworkServices::MediaSynchroniserManager *ms = GetMediaSyncManagerHandle(env, object);
   if (ms != nullptr)
   {
      return ms->getMediaSynchroniser(id);
   }
   return nullptr;
}

class App2AppServiceCallback : public NetworkServices::ServiceManager::ServiceCallback {
public:
   virtual void OnStopped()
   {
      gApp2AppServiceId = -1;
   }
};

class AndroidMediaSyncCallback : public NetworkServices::MediaSyncCallback {
public:
   explicit AndroidMediaSyncCallback(jobject callbackObject)
   {
      JNIEnv *env = JniUtils::GetEnv();
      mJavaCbObject = reinterpret_cast<jclass>(env->NewGlobalRef(callbackObject));
   }

   ~AndroidMediaSyncCallback() override
   {
      JNIEnv *env = JniUtils::GetEnv();
      env->DeleteGlobalRef(mJavaCbObject);
   }

   void dispatchTimelineAvailableEvent(std::string timelineSelector, u_int64_t unitsPerSecond) override
   {
      JNIEnv *env = JniUtils::GetEnv();
      jstring j_timeline = env->NewStringUTF(timelineSelector.c_str());
      env->CallVoidMethod(mJavaCbObject, gCb[CB_DISPATCH_TIMELINE_AVAILABLE_EVENT], j_timeline, unitsPerSecond);
      env->DeleteLocalRef(j_timeline);
   }

   void dispatchTimelineUnavailableEvent(std::string timelineSelector) override
   {
      JNIEnv *env = JniUtils::GetEnv();
      jstring j_timeline = env->NewStringUTF(timelineSelector.c_str());
      env->CallVoidMethod(mJavaCbObject, gCb[CB_DISPATCH_TIMELINE_UNAVAILABLE_EVENT], j_timeline);
      env->DeleteLocalRef(j_timeline);
   }

   void dispatchInterDeviceSyncEnabled(int mediaSyncId) override
   {
      JNIEnv *env = JniUtils::GetEnv();
      env->CallVoidMethod(mJavaCbObject, gCb[CB_DISPATCH_INTER_DEVICE_SYNC_ENABLED], mediaSyncId);
   }

   void dispatchInterDeviceSyncDisabled(int mediaSyncId) override
   {
      JNIEnv *env = JniUtils::GetEnv();
      env->CallVoidMethod(mJavaCbObject, gCb[CB_DISPATCH_INTER_DEVICE_SYNC_DISABLED], mediaSyncId);
   }

   int startTEMITimelineMonitoring(int componentTag, int timelineId) override
   {
      JNIEnv *env = JniUtils::GetEnv();
      return env->CallIntMethod(mJavaCbObject, gCb[CB_START_TIMELINE_MONITORING], componentTag, timelineId);
   }

   bool stopTEMITimelineMonitoring(int filterId) override
   {
      JNIEnv *env = JniUtils::GetEnv();
      return env->CallBooleanMethod(mJavaCbObject, gCb[CB_STOP_TIMELINE_MONITORING], filterId, false);
   }

   u_int64_t getCurrentPtsTime() override
   {
      JNIEnv *env = JniUtils::GetEnv();
      return env->CallLongMethod(mJavaCbObject, gCb[CB_GET_CURRENT_PTS_TIME]);
   }

   u_int64_t getCurrentTemiTime(int filterId) override
   {
      JNIEnv *env = JniUtils::GetEnv();
      return env->CallLongMethod(mJavaCbObject, gCb[CB_GET_CURRENT_TEMI_TIME], filterId);
   }

private:
   jobject mJavaCbObject;
};

extern "C" JNIEXPORT jint JNI_OnLoad(JavaVM *vm, void *)
{
   JniUtils::Init(vm, JNI_VERSION_1_6);
   JNIEnv *env = JniUtils::GetEnv();

   jclass managerClass = env->FindClass("org/orbtv/tvbrowser/MediaSynchroniserManager");
   gJavaManagerPointerField = env->GetFieldID(managerClass, "mNativeManagerPointerField", "J");

   // Add new callback methods here
   gCb[CB_DISPATCH_TIMELINE_AVAILABLE_EVENT] = env->GetMethodID(managerClass,
      "jniCbDispatchTimelineAvailableEvent", "(Ljava/lang/String;J)V");
   gCb[CB_DISPATCH_TIMELINE_UNAVAILABLE_EVENT] = env->GetMethodID(managerClass,
      "jniCbDispatchTimelineUnavailableEvent", "(Ljava/lang/String;)V");
   gCb[CB_START_TIMELINE_MONITORING] = env->GetMethodID(managerClass,
      "jniCbStartTEMITimelineMonitoring", "(II)I");
   gCb[CB_STOP_TIMELINE_MONITORING] = env->GetMethodID(managerClass,
      "jniCbStopTEMITimelineMonitoring", "(I)Z");
   gCb[CB_GET_CURRENT_PTS_TIME] = env->GetMethodID(managerClass,
      "jniCbGetCurrentPtsTime", "()J");
   gCb[CB_GET_CURRENT_TEMI_TIME] = env->GetMethodID(managerClass,
      "jniCbGetCurrentTemiTime", "(I)J");
   gCb[CB_DISPATCH_INTER_DEVICE_SYNC_ENABLED] = env->GetMethodID(managerClass,
      "jniCbDispatchInterDeviceSyncEnabled", "(I)V");
   gCb[CB_DISPATCH_INTER_DEVICE_SYNC_DISABLED] = env->GetMethodID(managerClass,
      "jniCbDispatchInterDeviceSyncDisabled", "(I)V");
   return JNI_VERSION_1_6;
}

extern "C"
JNIEXPORT void JNICALL Java_org_orbtv_tvbrowser_MediaSynchroniserManager_jniInitialise(JNIEnv *env, jobject thiz,
   jint ciiPort, jint wcPort, jint tsPort)
{
   auto timelineSyncCallback = std::make_shared<AndroidMediaSyncCallback>(thiz);
   auto *ms = new NetworkServices::MediaSynchroniserManager(std::move(timelineSyncCallback), ciiPort, wcPort, tsPort);
   env->SetLongField(thiz, gJavaManagerPointerField, jlong(ms));
}

extern "C"
JNIEXPORT jint JNICALL Java_org_orbtv_tvbrowser_MediaSynchroniserManager_jniCreateMediaSynchroniser(JNIEnv *env, jobject thiz)
{
   NetworkServices::MediaSynchroniserManager *ms = GetMediaSyncManagerHandle(env, thiz);
   return ms->createMediaSynchroniser();
}

extern "C"
JNIEXPORT jboolean JNICALL Java_org_orbtv_tvbrowser_MediaSynchroniserManager_jniInitialiseMediaSynchroniser(JNIEnv *env, jobject thiz,
   jint id, jboolean isMasterBroadcast)
{
   jboolean result = false;
   NetworkServices::MediaSynchroniserManager *ms = GetMediaSyncManagerHandle(env, thiz);
   if (ms != nullptr)
   {
      result = ms->initMediaSynchroniser(id, isMasterBroadcast);
   }
   return result;
}

extern "C"
JNIEXPORT void JNICALL Java_org_orbtv_tvbrowser_MediaSynchroniserManager_jniDestroyMediaSynchroniser(JNIEnv *env, jobject thiz,
   jint id)
{
   NetworkServices::MediaSynchroniserManager *ms = GetMediaSyncManagerHandle(env, thiz);
   if (ms != nullptr)
   {
      ms->destroyMediaSynchroniser(id);
   }
}

extern "C"
JNIEXPORT void JNICALL Java_org_orbtv_tvbrowser_MediaSynchroniserManager_jniDisableInterDeviceSync(JNIEnv *env,
   jobject thiz)
{
   NetworkServices::MediaSynchroniser *ms = GetActiveMediaSyncHandle(env, thiz);
   if (ms != nullptr)
   {
      ms->disableInterDeviceSync();
   }
}

extern "C"
JNIEXPORT jboolean JNICALL Java_org_orbtv_tvbrowser_MediaSynchroniserManager_jniEnableInterDeviceSync(JNIEnv *env,
   jobject thiz,
   jstring ipAddr)
{
   NetworkServices::MediaSynchroniser *ms = GetActiveMediaSyncHandle(env, thiz);
   bool ret = false;
   if (ms != nullptr)
   {
      jboolean isCopy;
      const char *nativeString = env->GetStringUTFChars(ipAddr, &isCopy);
      ret = ms->enableInterDeviceSync(nativeString);
      if (isCopy == JNI_TRUE)
      {
         env->ReleaseStringUTFChars(ipAddr, nativeString);
      }
   }
   return ret;
}

extern "C"
JNIEXPORT jint JNICALL Java_org_orbtv_tvbrowser_MediaSynchroniserManager_jniNrOfSlaves(JNIEnv *env, jobject thiz, jint id)
{
   NetworkServices::MediaSynchroniser *ms = GetMediaSyncHandleById(env, thiz, id);
   if (ms != nullptr)
   {
      return ms->nrOfSlaves();
   }
   return -1;
}

extern "C"
JNIEXPORT jboolean JNICALL Java_org_orbtv_tvbrowser_MediaSynchroniserManager_jniInterDeviceSyncEnabled(JNIEnv *env,
   jobject thiz, jint id)
{
   NetworkServices::MediaSynchroniser *ms = GetMediaSyncHandleById(env, thiz, id);
   if (ms != nullptr)
   {
      return ms->interDeviceSyncEnabled();
   }
   return false;
}

extern "C"
JNIEXPORT jstring JNICALL Java_org_orbtv_tvbrowser_MediaSynchroniserManager_jniGetContentIdOverride(JNIEnv *env,
   jobject thiz, jint id)
{
   NetworkServices::MediaSynchroniser *ms = GetMediaSyncHandleById(env, thiz, id);
   if (ms != nullptr)
   {
      return env->NewStringUTF(ms->getContentIdOverride().c_str());
   }
   return nullptr;
}

extern "C"
JNIEXPORT void JNICALL Java_org_orbtv_tvbrowser_MediaSynchroniserManager_jniSetContentIdOverride(JNIEnv *env,
   jobject thiz,
   jint id,
   jstring cid)
{
   jboolean valueIsCopy;
   const char *valueString = env->GetStringUTFChars(cid, &valueIsCopy);
   NetworkServices::MediaSynchroniser *ms = GetMediaSyncHandleById(env, thiz, id);
   if (ms != nullptr)
   {
      ms->setContentIdOverride(valueString, true);
      if (valueIsCopy == JNI_TRUE)
      {
         env->ReleaseStringUTFChars(cid, valueString);
      }
   }
}

extern "C"
JNIEXPORT void JNICALL Java_org_orbtv_tvbrowser_MediaSynchroniserManager_jniUpdateDvbInfo(JNIEnv *env,
   jobject thiz,
   jstring dvbUri,
   jboolean permanentError,
   jboolean presenting)
{
   jboolean valueIsCopy;
   const char *valueString = env->GetStringUTFChars(dvbUri, &valueIsCopy);
   NetworkServices::MediaSynchroniserManager *ms = GetMediaSyncManagerHandle(env, thiz);
   ms->updateDvbInfo(valueString, permanentError, presenting);
   if (valueIsCopy == JNI_TRUE)
   {
      env->ReleaseStringUTFChars(dvbUri, valueString);
   }
}

extern "C"
JNIEXPORT void JNICALL Java_org_orbtv_tvbrowser_MediaSynchroniserManager_jniUpdateCssCiiProperties(JNIEnv *env,
   jobject thiz,
   jstring json)
{
   NetworkServices::MediaSynchroniser *ms = GetActiveMediaSyncHandle(env, thiz);
   if (ms != nullptr)
   {
      jboolean isCopy;
      const char *nativeString = env->GetStringUTFChars(json, &isCopy);
      Json::Value properties;
      if (NetworkServices::CSSUtilities::unpack(nativeString, properties))
      {
         ms->updateCssCiiProperties(properties);
      }
      if (isCopy == JNI_TRUE)
      {
         env->ReleaseStringUTFChars(json, nativeString);
      }
   }
}

extern "C"
JNIEXPORT jboolean JNICALL Java_org_orbtv_tvbrowser_MediaSynchroniserManager_jniStartTimelineMonitoring(JNIEnv *env, jobject thiz,
   jstring timelineSelector,
   jboolean isMaster)
{
   jboolean result = false;
   NetworkServices::MediaSynchroniser *ms = GetActiveMediaSyncHandle(env, thiz);
   if (ms != nullptr)
   {
      jboolean isCopy;
      const char *nativeString = env->GetStringUTFChars(timelineSelector, &isCopy);
      result = ms->startTimelineMonitoring(nativeString, isMaster);
      if (isCopy == JNI_TRUE)
      {
         env->ReleaseStringUTFChars(timelineSelector, nativeString);
      }
   }
   return result;
}

extern "C"
JNIEXPORT void JNICALL Java_org_orbtv_tvbrowser_MediaSynchroniserManager_jniStopTimelineMonitoring(JNIEnv *env, jobject thiz,
   jstring timeline_selector,
   jboolean forceStop)
{
   NetworkServices::MediaSynchroniser *ms = GetActiveMediaSyncHandle(env, thiz);
   if (ms != nullptr)
   {
      jboolean isCopy;
      const char *nativeString = env->GetStringUTFChars(timeline_selector, &isCopy);
      ms->stopTimelineMonitoring(nativeString, forceStop);
      if (isCopy == JNI_TRUE)
      {
         env->ReleaseStringUTFChars(timeline_selector, nativeString);
      }
   }
}

extern "C"
JNIEXPORT jboolean JNICALL Java_org_orbtv_tvbrowser_MediaSynchroniserManager_jniSetContentTimeAndSpeed(JNIEnv *env,
   jobject thiz,
   jstring timelineSelector,
   jlong content_time,
   jdouble speed)
{
   NetworkServices::MediaSynchroniser *ms = GetActiveMediaSyncHandle(env, thiz);
   jboolean result = false;
   if (ms != nullptr)
   {
      jboolean valueIsCopy;
      const char *valueString = env->GetStringUTFChars(timelineSelector, &valueIsCopy);
      result = ms->setContentTimeAndSpeed(valueString, content_time, speed);
      if (valueIsCopy == JNI_TRUE)
      {
         env->ReleaseStringUTFChars(timelineSelector, valueString);
      }
   }
   return result;
}

extern "C"
JNIEXPORT jlong JNICALL Java_org_orbtv_tvbrowser_MediaSynchroniserManager_jniGetContentTime(JNIEnv *env,
   jobject thiz,
   jstring timelineSelector)
{
   NetworkServices::MediaSynchroniser *ms = GetActiveMediaSyncHandle(env, thiz);
   if (ms != nullptr)
   {
      bool success;
      jboolean valueIsCopy;
      const char *valueString = env->GetStringUTFChars(timelineSelector, &valueIsCopy);
      u_int64_t ticks = ms->getContentTime(valueString, success);
      if (valueIsCopy == JNI_TRUE)
      {
         env->ReleaseStringUTFChars(timelineSelector, valueString);
      }
      if (success)
      {
         return ticks;
      }
   }
   return -1;
}

extern "C"
JNIEXPORT jboolean JNICALL Java_org_orbtv_tvbrowser_MediaSynchroniserManager_jniSetTEMITimelineAvailability(JNIEnv *env, jobject thiz,
   jint filterId,
   jboolean isAvailable,
   jlong currentTime,
   jlong timescale,
   jdouble speed)
{
   NetworkServices::MediaSynchroniser *ms = GetActiveMediaSyncHandle(env, thiz);
   jboolean result = false;
   if (ms != nullptr)
   {
      result = ms->setTEMITimelineAvailability(filterId, isAvailable, currentTime, timescale, speed);
   }
   return result;
}

extern "C"
JNIEXPORT jboolean JNICALL Java_org_orbtv_tvbrowser_MediaSynchroniserManager_jniSetTimelineAvailability(JNIEnv *env, jobject thiz,
   jint id,
   jstring timelineSelector,
   jboolean isAvailable,
   jlong ticks,
   jdouble speed)
{
   NetworkServices::MediaSynchroniser *ms = GetActiveMediaSyncHandle(env, thiz);
   jboolean result = false;
   if (ms != nullptr)
   {
      jboolean valueIsCopy;
      const char *valueString = env->GetStringUTFChars(timelineSelector, &valueIsCopy);
      result = ms->setTimelineAvailability(valueString, isAvailable, ticks, speed);
      if (valueIsCopy == JNI_TRUE)
      {
         env->ReleaseStringUTFChars(timelineSelector, valueString);
      }
   }
   return result;
}

extern "C"
JNIEXPORT void JNICALL Java_org_orbtv_tvbrowser_MediaSynchroniserManager_jniReleaseResources(JNIEnv *env, jobject thiz)
{
   NetworkServices::MediaSynchroniserManager *ms = GetMediaSyncManagerHandle(env, thiz);
   if (ms != nullptr)
   {
      ms->releaseResources();
   }
}

extern "C"
JNIEXPORT jboolean JNICALL Java_org_orbtv_tvbrowser_App2AppService_jniStart(JNIEnv *env,
   jobject thiz,
   jint local_app2app_port,
   jint remote_app2app_port)
{
   if (gApp2AppServiceId == -1)
   {
      gApp2AppServiceId = NetworkServices::ServiceManager::GetInstance().StartApp2AppService(
         std::make_unique<App2AppServiceCallback>(),
         local_app2app_port,
         remote_app2app_port);
   }
   return gApp2AppServiceId != -1;
}

extern "C"
JNIEXPORT void JNICALL Java_org_orbtv_tvbrowser_App2AppService_jniStop(JNIEnv *env, jobject thiz)
{
   NetworkServices::ServiceManager::GetInstance().StopService(gApp2AppServiceId);
}
