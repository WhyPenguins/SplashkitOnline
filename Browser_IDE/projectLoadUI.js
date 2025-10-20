"use strict";

function ShowPopupGeneric({titleContent, innerContent, buttons=[], showCloseButton=true}){
    let resolveAndClose = null;
    let result = new Promise((resolve) => {
        resolveAndClose = function(x){
            removeFadeOut(loaderWindow, 200);
            resolve(x);
        }

        let closeButton;
        if (showCloseButton)
            closeButton = elem('button', {type:"button", class: "sk-demo-window-close-button"}, [elem('i', {class: "bi bi-x-lg"}, [])]);

        let mainRows =
        elem('div', {class: "sk-column"}, [
            elem('div', {class: "sk-demo-window-header"}, [
                elem('div', {class: "flex-column"}, [
                    titleContent
                ]),
                elem('div', {class: "flex-column"}, showCloseButton? [
                    closeButton,
                ] : []),
            ]),
            elem('div', {class: "sk-demo-window-content"}, [
                innerContent,
            ]),
            elem('div', {class: "sk-demo-window-buttons"}, buttons.map(function (x, i) {
                let button = elem('button', {class: x.class+" btn"}, x.text);
                button.addEventListener("click", function(){
                    resolveAndClose(i);
                });
                return button;
            }))
        ]);

        let loaderWindow =
        elem('div', {class: "sk-main-columns sk-demo-window-container fade-on-create"}, [
            elem('div', {class: "sk-notification sk-contents sk-contents-focusable sk-demo-window"}, [
                mainRows,
            ]),
        ]);

        if (showCloseButton)
            closeButton.addEventListener('click', function(){
                resolveAndClose(-1);
            });

        document.body.appendChild(loaderWindow);
    })

    return {
        result: result,
        resolve: resolveAndClose
    }
}

async function ShowConfirmationPopup(title, innerContent, yesText = "Yes", noText = "No", recommendNo=false){
    return await (ShowPopupGeneric({
        titleContent:title,
        innerContent:innerContent,
        buttons: [
            {text:yesText, class: recommendNo?"sk-demo-delete":"sk-demo-tag"},
            {text:noText, class: recommendNo?"sk-demo-tag":"sk-demo-delete"},
        ],
        showCloseButton: false}
    ).result) == 0;
}

async function ShowMessagePopup(title, innerContent, okayText = "Okay"){
    return await (ShowPopupGeneric({
        titleContent:title,
        innerContent:innerContent,
        buttons: [
            {text:okayText, class: "sk-demo-tag"},
        ],
        showCloseButton: true}
    ).result);
}

async function ShowProjectLoader(title, getChoices, load){
    let container = elem('div', {}, []);

    let loadingText = elem('div', {class: "sk-demo-window-loading-text", id:"DemoChooserLoader", style:{'position':'absolute'}}, [
        elem('h2', {style:{'text-align':'center'}}, ["Loading..."])
    ]);

    container.appendChild(loadingText);

    let popup = ShowPopupGeneric({titleContent:title, innerContent:container});

    // wait for our choices to download, then show them
    try {
        let choices = await getChoices();
        removeFadeOut(loadingText, 200);

        let gridContainer = elem('div', {class: "sk-contents sk-demo-thumbnail-grid-container fade-on-create", id:"DemoChooser"}, []);
        for(let i = 0 ; i < choices.length; i ++){
            let set = elem('div', {class: "sk-demo-thumbnail-grid", id:"DemoChooser"}, []);
            for(let j = 0 ; j < choices[i].length; j ++){
                let item = choices[i][j];

                let image = [];
                if (item["thumbnail"])
                    image = [elem('img', {src: item["thumbnail"], class: "sk-demo-thumbnail-img"})];

                let thumbnail =
                    elem('div', {class: "sk-demo-thumbnail"}, [...image, ...[
                        elem('div', {class: "sk-header sk-header-indent sk-demo-tags"}, [
                            elem('div', {class: "sk-demo-tag"}, [item["language"]]),
                        ]),
                        elem('div', {class: "sk-header sk-header-indent sk-demo-title"}, [
                            item["title"]
                        ]),
                    ]]);
                set.appendChild(thumbnail);

                thumbnail.addEventListener('click', async function(){
                    popup.resolve();

                    if (activeLanguage && activeLanguage.name != item["language"])
                        displayEditorNotification("Switching language to " + item["language"] + "<br>Page will reload.", NotificationIcons.INFO, -1);

                    load(item);
                });
            }
            gridContainer.appendChild(set);
            gridContainer.appendChild(elem("hr"));
        }

        container.appendChild(gridContainer);
    }
    catch(e){
        console.error(e);
        loadingText.childNodes[0].innerText = "Failed to load demo project list, sorry!";
    }
}

function LoadDemoProjects(){
    return fetch("DemoProjects/metadata/demos.json").then(res => res.json()).then(async json => {
        return json;
    });
}

async function LoadProjects(){
    let projects = await appStorage.access(async (s) => {
        return await s.getAllProjects();
    });
    let projectsListing = [];
    for (let project of projects){
        projectsListing.push({
            title: project.name,
            language: project.language,
            file: project.id,
            thumbnail: null
        });
    }
    return [projectsListing]
}
