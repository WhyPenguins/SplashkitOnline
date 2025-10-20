"use strict";

// utility functions for constructing HTML elements in JavaScript
function elem(tag, attrs = {}, childElems = []){
    let elem = document.createElement(tag);

    // loop over each attribute and apply it to the new element
    for (const [attrName, attrVal] of Object.entries(attrs)){
        if (attrName == 'style'){ // style special case
            for (const [styleName, styleVal] of Object.entries(attrVal)){
                elem.style[styleName] = styleVal;
            }
        }
        else{
            elem.setAttribute(attrName, attrVal);
        }
    }

    // add all the children
    elem.append(...childElems);

    return elem;
}

function elemFromText(text) {
    return new DOMParser().parseFromString(text, "text/html").body;
}

// from https://github.com/janl/mustache.js/blob/master/mustache.js#L73
var entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
};

function escape (string) {
    return String(string).replace(/[&<>"'`=\/]/g, function fromEntityMap (s) {
        return entityMap[s];
    });
}

// Thanks alvarodms!
// https://stackoverflow.com/a/33424474
function removeFadeOut( el, speed ) {
    var seconds = speed/1000;
    el.style.transition = "opacity "+seconds+"s ease";

    el.style.opacity = 0;
    setTimeout(function() {
        el.parentNode.removeChild(el);
    }, speed);
}
