/**
 * @fileOverview Monitors the document and certain JavaScript mechanisms for objects. Builds or
 * upgrades those objects if there is a registered handler.
 * @license ORB Software. Copyright (c) 2022 Ocean Blue Software Limited
 * Licensed under the ORB License that can be found in the LICENSE file at
 * the top level of this repository.
 */

hbbtv.objects = {};

hbbtv.objectManager = (function() {
   const __createElement = document.createElement;

   let objectMimeTypeTable = [];
   let objectFactoryMethodTable = [];
   let objectUpgradeHandlers = [];

   function initialise() {
      addOipfObjectFactory();
      addHTMLManipulationIntercept(function(manipulatedElement) {
         upgradeDescendantObjects(manipulatedElement);
      });
      addCreateElementTypeIntercept(function(object, type) {
         upgradeObject(object, type);
      });
      addMutationIntercept(function(addedObject) {
         hbbtv.holePuncher.notifyObjectAddedToDocument(addedObject);
         upgradeObject(addedObject, addedObject.getAttribute("type"));
      }, function(removedObject) {
         hbbtv.holePuncher.notifyObjectRemovedFromDocument(removedObject);
      });
      upgradeDescendantObjects(document);
   }

   function registerObject(options) {
      //console.debug("Register object " + options.name + " with mime types " + options.mimeTypes);
      for (const mimeType of options.mimeTypes) {
         objectMimeTypeTable[mimeType] = options.name;
      }
      if (options.oipfObjectFactoryMethodName.length > 0) {
         objectFactoryMethodTable[options.oipfObjectFactoryMethodName] = options.name;
      }
      objectUpgradeHandlers[options.name] = options.upgradeObject;
   }

   function resolveMimeType(mimeType) {
      if (mimeType in objectMimeTypeTable) {
         return objectMimeTypeTable[mimeType];
      }
      console.debug("Could not resolve mime type " + mimeType);
      return undefined;
   }

   function upgradeDescendantObjects(target) {
      for (const object of target.getElementsByTagName("object")) {
         if (object.hasAttribute("type")) {
            upgradeObject(object, object.getAttribute("type"));
         }
      }
      
      // upgrade video and audio elements with iframe
      for (const object of target.getElementsByTagName("video")) {
         hbbtv.objects.upgradeMediaElement(object);
      }
      for (const object of target.getElementsByTagName("audio")) {
         hbbtv.objects.upgradeMediaElement(object);
      }
   }

   function upgradeObject(object, mimeType) {
      if (!mimeType) {
         return;
      }
      mimeType = mimeType.toLowerCase();
      if (object.hasAttribute("__mimeType") && object.getAttribute("__mimeType") === mimeType) {
         // Already done
         return;
      }
      const objectName = resolveMimeType(mimeType);
      if (objectName !== undefined) {
         let mimeTypeChanged = false;
         if (object.hasAttribute("__objectType")) {
            if (object.getAttribute("__objectType") !== objectName) {
               // Ignore changes to the object type (but not the MIME type) [OIPF 5 4.4.4]
               return;
            }
            mimeTypeChanged = true;
         }
         object.setAttribute("__mimeType", mimeType);
         object.setAttribute("__objectType", objectName);
         if (mimeTypeChanged) {
            // TODO
         } else {
            objectUpgradeHandlers[objectName](object);
         }
      }
   }

   // Mutation observer
   function addMutationIntercept(callbackObjectAdded, callbackObjectRemoved) {
      const observer = new MutationObserver(function(mutationsList) {
         for (const mutation of mutationsList) {
            if (mutation.type === "childList") {
               for (const node of mutation.addedNodes) {
                  if (node.nodeName) {
                     if (node.nodeName.toLowerCase() === "object") {
                        callbackObjectAdded(node);
                     }
                     else if(node.nodeName.toLowerCase() === "video" || node.nodeName.toLowerCase() === "audio") {
                        // upgrade video and audio elements with iframe
                        hbbtv.objects.upgradeMediaElement(node);
                     }
                  }
               }
               for (const node of mutation.removedNodes) {
                  if (node.nodeName && node.nodeName.toLowerCase() === "object") {
                     callbackObjectRemoved(node);
                  }
               }
            }
         }
      });
      const config = {
         childList: true,
         subtree: true,
         attributes: true,
      };
      observer.observe(document.documentElement || document.body, config);
   }

   // Override createElement install a proxy to monitor and intercept objects. Needed for the
   // case where a page script creates and uses an object before adding it to the document.
   function addCreateElementTypeIntercept(callbackTypeSet) {
      document.createElement = function(tagname, options) {
         let element;
         if (tagname === "video" || tagname === "audio") {
            // upgrade video and audio elements with iframe
            element = hbbtv.objects.upgradeMediaElement(__createElement.call(document, tagname, options));
         }
         else if (tagname === "object") {
            element = __createElement.apply(document, arguments);
            const ownProperty = Object.getOwnPropertyDescriptor(HTMLObjectElement.prototype, "type");
            Object.defineProperty(element, "type", {
               set(val) {
                  this.setAttribute("type", val);
               },
               get() {
                  return ownProperty.get.call(this);
               }
            });

            element.setAttribute = function(name, value) {
               if (name === "type") {
                  callbackTypeSet(element, value);
               }
               Element.prototype.setAttribute.apply(element, arguments);
            };
         }
         else {
            element = __createElement.apply(document, arguments);
         }
         return element;
      };
   }

   // Intercept direct HTML manipulation. Needed for the (possibly esoteric) case where a page
   // script directly modifies the HTML to create an object and immediately uses it (i.e. before
   // the event loop processes mutation events).
   function addHTMLManipulationIntercept(interceptCallback) {
      Object.defineProperty(HTMLElement.prototype, "innerHTML", {
         set: function(val) {
            const ownProperty = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
            ownProperty.set.call(this, val);
            interceptCallback(this);
         },
         get: function() {
            const ownProperty = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
            return ownProperty.get.call(this);
         }
      });
      Object.defineProperty(HTMLElement.prototype, "outerHTML", {
         set: function(val) {
            const parent = this.parentElement;
            const ownProperty = Object.getOwnPropertyDescriptor(Element.prototype, "outerHTML");
            ownProperty.set.call(this, val);
            interceptCallback(parent);
         },
         get: function() {
            const ownProperty = Object.getOwnPropertyDescriptor(Element.prototype, "outerHTML");
            return ownProperty.get.call(this);
         }
      })
      HTMLElement.prototype.insertAdjacentHTML = function(position, text) {
         const result = Element.prototype.insertAdjacentHTML.call(this, position, text);
         interceptCallback(this.parentElement);
         return result;
      };
   }

   function addOipfObjectFactory() {
      if (window.oipfObjectFactory !== undefined) {
         console.error("Cannot redefine oipfObjectFactory!");
         return;
      }

      window.oipfObjectFactory = {
         isObjectSupported: function(objectType) {
            return resolveMimeType(objectType.toLowerCase()) !== undefined;
         }
      };

      for (let objectFactoryMethod in objectFactoryMethodTable) {
         console.log(objectFactoryMethod);
         const objectName = objectFactoryMethodTable[objectFactoryMethod];
         window.oipfObjectFactory[objectFactoryMethod] = function() {
            const object = __createElement.call(document, "object");
            object.setAttribute("type", objectName);
            objectUpgradeHandlers[objectName](object);
            return object;
         };
      }
   }

   return {
      initialise: initialise,
      registerObject: registerObject
   };
})();