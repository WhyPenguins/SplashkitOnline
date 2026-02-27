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
function elemNS(namespace, tag, attrs = {}, childElems = []){
    let elem = document.createElementNS(namespace, tag);

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

const SVGNamespace = "http://www.w3.org/2000/svg";
const SVGType = 'image/svg+xml';

function elemFromText(text) {
    return new DOMParser().parseFromString(text, "text/html").body;
}

function elemFromSVG(text) {
    return new DOMParser().parseFromString("<svg xmlns='http://www.w3.org/2000/svg' version='1.1' preserveAspectRatio='none' viewBox='0 0 200 100'>"+text+"</svg>", 'image/svg+xml').documentElement.childNodes;
}

// convenience functions for common elements
// TODO: add some more, reduce the repetition
function $div(classes, attrs/*children*/, children){
    if (arguments.length == 2) {
        children = attrs;
        attrs = {};
    }
    attrs.class = classes;
    return elem("div", attrs, children);
}

function $span(classes, attrs/*children*/, children){
    if (arguments.length == 2) {
        children = attrs;
        attrs = {};
    }
    attrs.class = classes;
    return elem("span", attrs, children);
}


// TODO: Improve - maybe Markdown style behaviour could be good?
function parseBasicFormatting(text){
    if (typeof text != "string")
        return text;

    return elemFromText(escape(text).replaceAll("\n", "<br/>"))
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
function removeFadeOut( el, speed, callback) {
    var seconds = speed/1000;
    el.style.transition = "opacity "+seconds+"s ease";

    el.style.opacity = 0;
    setTimeout(function() {
        if (el.parentNode)
            el.parentNode.removeChild(el);
        if (callback)
            setTimeout(callback, 0);
    }, speed);
}

function removeFromLayout(el) {
    let left = el.offsetLeft;
    let top = el.offsetTop;

    el.style.position = "absolute";
    el.style.left = left+"px";
    el.style.top = top+"px";
    el.style.margin = "0";
}

function removeFadeOutNonLayout(el, speed, callback) {
    removeFromLayout(el);
    removeFadeOut(el, speed, callback);
}
