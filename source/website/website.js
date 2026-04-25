import { GetFileExtension, TransformFileHostUrls } from '../engine/io/fileutils.js';
import { InputFilesFromFileObjects, InputFilesFromUrls } from '../engine/import/importerfiles.js';
import { ImportErrorCode, ImportSettings } from '../engine/import/importer.js';
import { NavigationMode, ProjectionMode } from '../engine/viewer/camera.js';
import { RGBColor } from '../engine/model/color.js';
import { Viewer } from '../engine/viewer/viewer.js';
import { AddDiv, AddDomElement, ShowDomElement, SetDomElementOuterHeight, CreateDomElement, GetDomElementOuterWidth } from '../engine/viewer/domutils.js';
import { CalculatePopupPositionToScreen, ShowListPopup } from './dialogs.js';
import { HandleEvent } from './eventhandler.js';
import { HashHandler } from './hashhandler.js';
import { Navigator } from './navigator.js';
import { CameraSettings, Settings, Theme } from './settings.js';
import { Sidebar } from './sidebar.js';
import { ThemeHandler } from './themehandler.js';
import { ThreeModelLoaderUI } from './threemodelloaderui.js';
import { Toolbar } from './toolbar.js';
import { DownloadModel, ShowExportDialog } from './exportdialog.js';
import { ShowSnapshotDialog } from './snapshotdialog.js';
import { AddSvgIconElement, GetFilesFromDataTransfer, InstallTooltip, IsSmallWidth } from './utils.js';
import { ShowOpenUrlDialog } from './openurldialog.js';
import { ShowSharingDialog } from './sharingdialog.js';
import { GetDefaultMaterials, ReplaceDefaultMaterialsColor } from '../engine/model/modelutils.js';
import { Direction } from '../engine/geometry/geometry.js';
import { CookieGetBoolVal, CookieSetBoolVal } from './cookiehandler.js';
import { MeasureTool } from './measuretool.js';
import { CloseAllDialogs } from './dialog.js';
import { CreateVerticalSplitter } from './splitter.js';
import { EnumeratePlugins, PluginType } from './pluginregistry.js';
import { EnvironmentSettings } from '../engine/viewer/shadingmodel.js';
import { IntersectionMode } from '../engine/viewer/viewermodel.js';
import { Loc } from '../engine/core/localization.js';
import eventBus, { Events } from './eventbus.js';
import { InputManager } from './inputmanager.js';
import { SelectionManager, CreateMeshEntry } from './selectionmanager.js';
import { KeyboardHandler } from './keyboardhandler.js';
import { SnapSystem } from './snap.js';
import { GizmoManager } from './gizmo/gizmomanager.js';
import { ContextMenu } from './contextmenu.js';
import { GroupManager } from './groupmanager.js';
import { GroupDialog } from './groupdialog.js';
import { Transformation } from '../engine/geometry/transformation.js';
import { Matrix } from '../engine/geometry/matrix.js';
import { InfiniteGrid } from './grid.js';
import { GridSlider } from './gridslider.js';
import { ModeCoordinator } from './modecoordinator.js';

const WebsiteUIState =
{
    Undefined : 0,
    Intro : 1,
    Model : 2,
    Loading : 3
};

class WebsiteLayouter
{
    constructor (parameters, navigator, sidebar, viewer, measureTool)
    {
        this.parameters = parameters;
        this.navigator = navigator;
        this.sidebar = sidebar;
        this.viewer = viewer;
        this.measureTool = measureTool;
        this.limits = {
            minPanelWidth : 290,
            minCanvasWidth : 100
        };
    }

    Init ()
    {
        this.InstallSplitter (this.parameters.navigatorSplitterDiv, this.parameters.navigatorDiv, (originalWidth, xDiff) => {
            let newWidth = originalWidth + xDiff;
            this.OnSplitterDragged (newWidth - this.navigator.GetWidth (), 0);
        });

        this.InstallSplitter (this.parameters.sidebarSplitterDiv, this.parameters.sidebarDiv, (originalWidth, xDiff) => {
            let newWidth = originalWidth - xDiff;
            this.OnSplitterDragged (0, newWidth - this.sidebar.GetWidth ());
        });

        this.Resize ();
    }

    InstallSplitter (splitterDiv, resizedDiv, onSplit)
    {
        let originalWidth = null;
        CreateVerticalSplitter (splitterDiv, {
            onSplitStart : () => {
                originalWidth = GetDomElementOuterWidth (resizedDiv);
            },
            onSplit : (xDiff) => {
                onSplit (originalWidth, xDiff);
            }
        });
    }

    OnSplitterDragged (leftDiff, rightDiff)
    {
        let windowWidth = window.innerWidth;

        let navigatorWidth = this.navigator.GetWidth ();
        let sidebarWidth = this.sidebar.GetWidth ();

        let leftWidth = GetDomElementOuterWidth (this.parameters.leftContainerDiv);
        let rightWidth = GetDomElementOuterWidth (this.parameters.rightContainerDiv);

        let newLeftWidth = leftWidth + leftDiff;
        let newRightWidth = rightWidth + rightDiff;
        let contentNewWidth = windowWidth - newLeftWidth - newRightWidth;

        let isNavigatorVisible = this.navigator.IsPanelsVisible ();
        let isSidebarVisible = this.sidebar.IsPanelsVisible ();

        if (isNavigatorVisible && newLeftWidth < this.limits.minPanelWidth) {
            newLeftWidth = this.limits.minPanelWidth;
        }

        if (isSidebarVisible && newRightWidth < this.limits.minPanelWidth) {
            newRightWidth = this.limits.minPanelWidth;
        }

        if (contentNewWidth < this.limits.minCanvasWidth) {
            if (leftDiff > 0) {
                newLeftWidth = windowWidth - newRightWidth - this.limits.minCanvasWidth;
            } else if (rightDiff > 0) {
                newRightWidth = windowWidth - newLeftWidth - this.limits.minCanvasWidth;
            }
        }

        if (isNavigatorVisible) {
            let newNavigatorWidth = navigatorWidth + (newLeftWidth - leftWidth);
            this.navigator.SetWidth (newNavigatorWidth);
        }
        if (isSidebarVisible) {
            let newSidebarWidth = sidebarWidth + (newRightWidth - rightWidth);
            this.sidebar.SetWidth (newSidebarWidth);
        }

        this.Resize ();
    }

    Resize ()
    {
        let windowWidth = window.innerWidth;
        let windowHeight = window.innerHeight;
        let headerHeight = this.parameters.headerDiv.offsetHeight;

        let leftWidth = 0;
        let rightWidth = 0;
        let safetyMargin = 0;
        if (!IsSmallWidth ()) {
            leftWidth = GetDomElementOuterWidth (this.parameters.leftContainerDiv);
            rightWidth = GetDomElementOuterWidth (this.parameters.rightContainerDiv);
            safetyMargin = 1;
        }

        let contentWidth = windowWidth - leftWidth - rightWidth;
        let contentHeight = windowHeight - headerHeight;

        if (contentWidth < this.limits.minCanvasWidth) {
            let neededIncrease = this.limits.minCanvasWidth - contentWidth;

            let isNavigatorVisible = this.navigator.IsPanelsVisible ();
            let isSidebarVisible = this.sidebar.IsPanelsVisible ();

            if (neededIncrease > 0 && isNavigatorVisible) {
                let navigatorDecrease = Math.min (neededIncrease, leftWidth - this.limits.minPanelWidth);
                this.navigator.SetWidth (this.navigator.GetWidth () - navigatorDecrease);
                neededIncrease = neededIncrease - navigatorDecrease;
            }

            if (neededIncrease > 0 && isSidebarVisible) {
                let sidebarDecrease = Math.min (neededIncrease, rightWidth - this.limits.minPanelWidth);
                this.sidebar.SetWidth (this.sidebar.GetWidth () - sidebarDecrease);
            }

            leftWidth = GetDomElementOuterWidth (this.parameters.leftContainerDiv);
            rightWidth = GetDomElementOuterWidth (this.parameters.rightContainerDiv);
            contentWidth = windowWidth - leftWidth - rightWidth;
        }

        this.navigator.Resize (contentHeight);
        SetDomElementOuterHeight (this.parameters.navigatorSplitterDiv, contentHeight);

        this.sidebar.Resize (contentHeight);
        SetDomElementOuterHeight (this.parameters.sidebarSplitterDiv, contentHeight);

        SetDomElementOuterHeight (this.parameters.introDiv, contentHeight);
        this.viewer.Resize (contentWidth - safetyMargin, contentHeight);

        this.measureTool.Resize ();
    }
}

export class Website
{
    constructor (parameters)
    {
        this.parameters = parameters;
        this.settings = new Settings (Theme.Light);
        this.cameraSettings = new CameraSettings ();
        this.viewer = new Viewer ();
        this.measureTool = new MeasureTool (this.viewer, this.settings);
        this.hashHandler = new HashHandler ();
        this.toolbar = new Toolbar (this.parameters.toolbarDiv);
        this.navigator = new Navigator (this.parameters.navigatorDiv);
        this.sidebar = new Sidebar (this.parameters.sidebarDiv, this.settings);
        this.modelLoaderUI = new ThreeModelLoaderUI ();
        this.themeHandler = new ThemeHandler ();
        this.highlightColor = new RGBColor (142, 201, 240);
        this.uiState = WebsiteUIState.Undefined;
        this.layouter = new WebsiteLayouter (this.parameters, this.navigator, this.sidebar, this.viewer, this.measureTool);
        this.model = null;
        this.selectionManager = null;
        this.inputManager = null;
        this.keyboardHandler = null;
        this.snapSystem = null;
        this.gizmoManager = null;
        this.contextMenu = new ContextMenu ();
        this.groupManager = new GroupManager (eventBus);
        this.groupDialog = new GroupDialog ();
        this.transformModeButtonsArray = null;
        this.snapButton = null;
        this.grid = null;
        this.gridSlider = null;
        this.modeCoordinator = null;
    }

    Load ()
    {
        this.settings.LoadFromCookies ();
        this.cameraSettings.LoadFromCookies ();

        this.SwitchTheme (this.settings.themeId, false);
        HandleEvent ('theme_on_load', this.settings.themeId === Theme.Light ? 'light' : 'dark');

        EnumeratePlugins (PluginType.Header, (plugin) => {
            plugin.registerButtons ({
                createHeaderButton : (icon, title, link) => {
                    this.CreateHeaderButton (icon, title, link);
                }
            });
        });

        this.selectionManager = new SelectionManager (eventBus);
        this.snapSystem = new SnapSystem (eventBus);
        this.keyboardHandler = new KeyboardHandler (eventBus);
        this.InitViewer ();
        this.InitSidebarActions ();
        this.InitToolbar ();
        this.InitDragAndDrop ();
        this.InitSidebar ();
        this.InitNavigator ();
        this.InitCookieConsent ();

        // ModeCoordinator wires cross-system mode rules
        this.modeCoordinator = new ModeCoordinator (
            eventBus,
            this.gizmoManager,
            this.measureTool,
            this.selectionManager,
            this.contextMenu
        );

        this.viewer.SetMouseClickHandler (this.OnModelClicked.bind (this));
        this.viewer.SetMouseMoveHandler (this.OnModelMouseMoved.bind (this));
        this.viewer.SetContextMenuHandler (this.OnModelContextMenu.bind (this));

        eventBus.on (Events.SelectionSelectAll, () => {
            if (this.model === null) {
                return;
            }
            let entries = [];
            this.model.EnumerateMeshInstances ((meshInstance) => {
                let id = meshInstance.GetId ();
                entries.push (CreateMeshEntry (id.nodeId, id.meshIndex));
            });
            this.selectionManager.selectAll (entries);
        });

        eventBus.on (Events.CameraFocusRequested, (data) => {
            if (data && data.meshInstanceId) {
                this.FitMeshToWindow (data.meshInstanceId);
            }
        });

        this.layouter.Init ();
        this.SetUIState (WebsiteUIState.Intro);

        this.hashHandler.SetEventListener (this.OnHashChange.bind (this));
        this.OnHashChange ();

        window.addEventListener ('resize', () => {
			this.layouter.Resize ();
		});
    }

    HasLoadedModel ()
    {
        return this.model !== null;
    }

    SetUIState (uiState)
    {
        function ShowOnlyOnModelElements (show)
        {
            let root = document.querySelector (':root');
            root.style.setProperty ('--ov_only_on_model_display', show ? 'inherit' : 'none');
        }

        if (this.uiState === uiState) {
            return;
        }

        this.uiState = uiState;
        if (this.uiState === WebsiteUIState.Intro) {
            ShowDomElement (this.parameters.introDiv, true);
            ShowDomElement (this.parameters.headerDiv, true);
            ShowDomElement (this.parameters.mainDiv, false);
            ShowOnlyOnModelElements (false);
        } else if (this.uiState === WebsiteUIState.Model) {
            ShowDomElement (this.parameters.introDiv, false);
            ShowDomElement (this.parameters.headerDiv, true);
            ShowDomElement (this.parameters.mainDiv, true);
            ShowOnlyOnModelElements (true);
            this.UpdatePanelsVisibility ();
        } else if (this.uiState === WebsiteUIState.Loading) {
            ShowDomElement (this.parameters.introDiv, false);
            ShowDomElement (this.parameters.headerDiv, true);
            ShowDomElement (this.parameters.mainDiv, false);
            ShowOnlyOnModelElements (false);
        }

        this.layouter.Resize ();
    }

    ClearModel ()
    {
        CloseAllDialogs ();

        this.model = null;
        this.viewer.Clear ();

        this.parameters.fileNameDiv.innerHTML = '';

        this.navigator.Clear ();
        this.sidebar.Clear ();

        this.measureTool.SetActive (false);
    }

    OnModelLoaded (importResult, threeObject)
    {
        this.model = importResult.model;
        this.parameters.fileNameDiv.innerHTML = importResult.mainFile;
        this.viewer.SetMainObject (threeObject);
        this.viewer.SetUpVector (Direction.Y, false);
        this.navigator.FillTree (importResult);
        this.sidebar.UpdateControlsVisibility ();
        this.FitModelToWindow (true);
        if (this.gizmoManager) {
            this.gizmoManager.SetModelRef (this.model);
        }
        if (this.groupManager) {
            this.groupManager.SetModel (this.model);
        }
    }

    OnModelClicked (button, mouseCoordinates)
    {
        if (button !== 1) {
            return;
        }

        if (this.measureTool.IsActive ()) {
            this.measureTool.Click (mouseCoordinates);
            return;
        }

        let meshUserData = this.viewer.GetMeshUserDataUnderMouse (IntersectionMode.MeshAndLine, mouseCoordinates);
        if (meshUserData === null) {
            this.selectionManager.deselectAll ();
        } else {
            let id = meshUserData.originalMeshInstance.id;
            let entry = CreateMeshEntry (id.nodeId, id.meshIndex);
            if (this.inputManager && this.inputManager.isCtrlPressed ()) {
                this.selectionManager.toggleSelect (entry);
            } else {
                this.selectionManager.select (entry);
            }
        }
    }

    OnModelMouseMoved (mouseCoordinates)
    {
        if (this.measureTool.IsActive ()) {
            this.measureTool.MouseMove (mouseCoordinates);
        }
    }

    OnModelContextMenu (globalMouseCoordinates, mouseCoordinates)
    {
        let meshUserData = this.viewer.GetMeshUserDataUnderMouse (IntersectionMode.MeshAndLine, mouseCoordinates);
        let items = [];
        if (meshUserData === null) {
            items.push ({
                name : Loc ('Fit model to window'),
                icon : 'fit',
                onClick : () => {
                    this.FitModelToWindow (false);
                }
            });
            if (this.navigator.HasHiddenMesh ()) {
                items.push ({
                    name : Loc ('Show all meshes'),
                    icon : 'visible',
                    onClick : () => {
                        this.navigator.ShowAllMeshes (true);
                    }
                });
            }
        } else {
            items.push ({
                name : Loc ('Hide mesh'),
                icon : 'hidden',
                onClick : () => {
                    this.navigator.ToggleMeshVisibility (meshUserData.originalMeshInstance.id);
                }
            });
            items.push ({
                name : Loc ('Fit mesh to window'),
                icon : 'fit',
                onClick : () => {
                    this.navigator.FitMeshToWindow (meshUserData.originalMeshInstance.id);
                }
            });
            if (this.navigator.MeshItemCount () > 1) {
                let isMeshIsolated = this.navigator.IsMeshIsolated (meshUserData.originalMeshInstance.id);
                items.push ({
                    name : isMeshIsolated ? Loc ('Remove isolation') : Loc ('Isolate mesh'),
                    icon : isMeshIsolated ? 'deisolate' : 'isolate',
                    onClick : () => {
                        if (isMeshIsolated) {
                            this.navigator.ShowAllMeshes (true);
                        } else {
                            this.navigator.IsolateMesh (meshUserData.originalMeshInstance.id);
                        }
                    }
                });
            }
        }
        ShowListPopup (items, {
            calculatePosition : (contentDiv) => {
                return CalculatePopupPositionToScreen (globalMouseCoordinates, contentDiv);
            },
            onClick : (index) => {
                let clickedItem = items[index];
                clickedItem.onClick ();
            }
        });
    }

    OnHashChange ()
    {
        if (this.hashHandler.HasHash ()) {
            let urls = this.hashHandler.GetModelFilesFromHash ();
            if (urls === null) {
                return;
            }
            TransformFileHostUrls (urls);
            let importSettings = new ImportSettings ();
            importSettings.defaultLineColor = this.settings.defaultLineColor;
            importSettings.defaultColor = this.settings.defaultColor;
            let defaultColor = this.hashHandler.GetDefaultColorFromHash ();
            if (defaultColor !== null) {
                importSettings.defaultColor = defaultColor;
            }
            HandleEvent ('model_load_started', 'hash');
            this.LoadModelFromUrlList (urls, importSettings);
        } else {
            this.ClearModel ();
            this.SetUIState (WebsiteUIState.Intro);
        }
    }

    OpenFileBrowserDialog ()
    {
        this.parameters.fileInput.click ();
    }

    FitModelToWindow (onLoad)
    {
        let animation = !onLoad;
        let boundingSphere = this.viewer.GetBoundingSphere ((meshUserData) => {
            return this.navigator.IsMeshVisible (meshUserData.originalMeshInstance.id);
        });
        if (onLoad) {
            this.viewer.AdjustClippingPlanesToSphere (boundingSphere);
        }
        this.viewer.FitSphereToWindow (boundingSphere, animation);
    }

    FitMeshToWindow (meshInstanceId)
    {
        let boundingSphere = this.viewer.GetBoundingSphere ((meshUserData) => {
            return meshUserData.originalMeshInstance.id.IsEqual (meshInstanceId);
        });
        this.viewer.FitSphereToWindow (boundingSphere, true);
    }

    FitMeshesToWindow (meshInstanceIdSet)
    {
        let meshInstanceIdKeys = new Set ();
        for (let meshInstanceId of meshInstanceIdSet) {
            meshInstanceIdKeys.add (meshInstanceId.GetKey ());
        }
        let boundingSphere = this.viewer.GetBoundingSphere ((meshUserData) => {
            return meshInstanceIdKeys.has (meshUserData.originalMeshInstance.id.GetKey ());
        });
        this.viewer.FitSphereToWindow (boundingSphere, true);
    }

    UpdateMeshesVisibility ()
    {
        this.viewer.SetMeshesVisibility ((meshUserData) => {
            return this.navigator.IsMeshVisible (meshUserData.originalMeshInstance.id);
        });
    }

    UpdateMeshesSelection ()
    {
        if (this.selectionManager) {
            let meshEntries = this.selectionManager.getSelection ().filter ((e) => e.type === 'mesh');
            if (meshEntries.length > 0) {
                let selectedKeys = new Set (meshEntries.map ((e) => e.nodeId + ':' + e.meshIndex));
                this.viewer.SetMeshesHighlight (this.highlightColor, (meshUserData) => {
                    return selectedKeys.has (meshUserData.originalMeshInstance.id.GetKey ());
                });
                return;
            }
        }
        // Fallback: single selection or temp (material panel hover)
        let selectedMeshId = this.navigator.GetSelectedMeshId ();
        this.viewer.SetMeshesHighlight (this.highlightColor, (meshUserData) => {
            if (selectedMeshId !== null && meshUserData.originalMeshInstance.id.IsEqual (selectedMeshId)) {
                return true;
            }
            return false;
        });
    }

    LoadModelFromUrlList (urls, settings)
    {
        let inputFiles = InputFilesFromUrls (urls);
        this.LoadModelFromInputFiles (inputFiles, settings);
        this.ClearHashIfNotOnlyUrlList ();
    }

    LoadModelFromFileList (files)
    {
        let importSettings = new ImportSettings ();
        importSettings.defaultLineColor = this.settings.defaultLineColor;
        importSettings.defaultColor = this.settings.defaultColor;
        let inputFiles = InputFilesFromFileObjects (files);
        this.LoadModelFromInputFiles (inputFiles, importSettings);
        this.ClearHashIfNotOnlyUrlList ();
    }

    LoadModelFromInputFiles (files, settings)
    {
        this.modelLoaderUI.LoadModel (files, settings, {
            onStart : () =>
            {
                this.SetUIState (WebsiteUIState.Loading);
                this.ClearModel ();
            },
            onFinish : (importResult, threeObject) =>
            {
                this.SetUIState (WebsiteUIState.Model);
                this.OnModelLoaded (importResult, threeObject);
                let importedExtension = GetFileExtension (importResult.mainFile);
                HandleEvent ('model_loaded', importedExtension);
            },
            onRender : () =>
            {
                this.viewer.Render ();
            },
            onError : (importError) =>
            {
                this.SetUIState (WebsiteUIState.Intro);
                let extensionStr = null;
                if (importError.mainFile !== null) {
                    extensionStr = GetFileExtension (importError.mainFile);
                } else {
                    let extensions = [];
                    let importer = this.modelLoaderUI.GetImporter ();
                    let fileList = importer.GetFileList ().GetFiles ();
                    for (let i = 0; i < fileList.length; i++) {
                        let extension = fileList[i].extension;
                        extensions.push (extension);
                    }
                    extensionStr = extensions.join (',');
                }
                if (importError.code === ImportErrorCode.NoImportableFile) {
                    HandleEvent ('no_importable_file', extensionStr);
                } else if (importError.code === ImportErrorCode.FailedToLoadFile) {
                    HandleEvent ('failed_to_load_file', extensionStr);
                } else if (importError.code === ImportErrorCode.ImportFailed) {
                    HandleEvent ('import_failed', extensionStr, {
                        error_message : importError.message
                    });
                }
            }
        });
    }

    ClearHashIfNotOnlyUrlList ()
    {
        let importer = this.modelLoaderUI.GetImporter ();
        let isOnlyUrl = importer.GetFileList ().IsOnlyUrlSource ();
        if (!isOnlyUrl && this.hashHandler.HasHash ()) {
            this.hashHandler.SkipNextEventHandler ();
            this.hashHandler.ClearHash ();
        }
    }

    UpdateEdgeDisplay ()
    {
        this.settings.SaveToCookies ();
        this.viewer.SetEdgeSettings (this.settings.edgeSettings);
    }

    UpdateEnvironmentMap ()
    {
        let envMapPath = 'assets/envmaps/' + this.settings.environmentMapName + '/';
        let envMapTextures = [
            envMapPath + 'posx.jpg',
            envMapPath + 'negx.jpg',
            envMapPath + 'posy.jpg',
            envMapPath + 'negy.jpg',
            envMapPath + 'posz.jpg',
            envMapPath + 'negz.jpg'
        ];
        let environmentSettings = new EnvironmentSettings (envMapTextures, this.settings.backgroundIsEnvMap);
        this.viewer.SetEnvironmentMapSettings (environmentSettings);
    }

    SwitchTheme (newThemeId, resetColors)
    {
        this.settings.themeId = newThemeId;
        this.themeHandler.SwitchTheme (this.settings.themeId);
        if (resetColors) {
            let defaultSettings = new Settings (this.settings.themeId);
            this.settings.backgroundColor = defaultSettings.backgroundColor;
            this.settings.defaultLineColor = defaultSettings.defaultLineColor;
            this.settings.defaultColor = defaultSettings.defaultColor;
            this.sidebar.UpdateControlsStatus ();

            this.viewer.SetBackgroundColor (this.settings.backgroundColor);
            let modelLoader = this.modelLoaderUI.GetModelLoader ();
            if (modelLoader.GetDefaultMaterials () !== null) {
                ReplaceDefaultMaterialsColor (this.model, this.settings.defaultColor, this.settings.defaultLineColor);
                modelLoader.ReplaceDefaultMaterialsColor (this.settings.defaultColor, this.settings.defaultLineColor);
            }
        }

        this.settings.SaveToCookies ();
    }

    InitViewer ()
    {
        let canvas = AddDomElement (this.parameters.viewerDiv, 'canvas');
        this.viewer.Init (canvas);
        this.inputManager = new InputManager (canvas);
        this.gizmoManager = new GizmoManager (
            this.viewer,
            eventBus,
            this.selectionManager,
            this.inputManager,
            this.snapSystem
        );
        // Wire gizmo drag flag to viewer for navigation suppression
        eventBus.on (Events.GizmoDragStart, () => {
            this.viewer.SetGizmoDragging (true);
        });
        eventBus.on (Events.GizmoDragEnd, () => {
            this.viewer.SetGizmoDragging (false);
        });

        // Build infinite grid
        this.grid = new InfiniteGrid (this.viewer);
        this.grid.show ();

        // Build grid slider — canvas container is the viewerDiv
        this.gridSlider = new GridSlider (this.grid, this.parameters.viewerDiv);

        // Update grid fade distance on camera move
        this.viewer.SetCameraUpdateHandler (() => {
            if (this.grid) {
                let camera = this.viewer.GetCamera ();
                this.grid.update (camera);
            }
        });
        this.viewer.SetEdgeSettings (this.settings.edgeSettings);
        this.viewer.SetBackgroundColor (this.settings.backgroundColor);
        this.viewer.SetNavigationMode (this.cameraSettings.navigationMode);
        this.viewer.SetProjectionMode (this.cameraSettings.projectionMode);
        this.UpdateEnvironmentMap ();
    }

    InitToolbar ()
    {
        function AddButton (toolbar, imageName, imageTitle, classNames, onClick)
        {
            let button = toolbar.AddImageButton (imageName, imageTitle, () => {
                onClick ();
            });
            for (let className of classNames) {
                button.AddClass (className);
            }
            return button;
        }

        function AddPushButton (toolbar, imageName, imageTitle, classNames, onClick)
        {
            let button = toolbar.AddImagePushButton (imageName, imageTitle, false, (isSelected) => {
                onClick (isSelected);
            });
            for (let className of classNames) {
                button.AddClass (className);
            }
            return button;
        }

        function AddRadioButton (toolbar, imageNames, imageTitles, selectedIndex, classNames, onClick)
        {
            let imageData = [];
            for (let i = 0; i < imageNames.length; i++) {
                let imageName = imageNames[i];
                let imageTitle = imageTitles[i];
                imageData.push ({
                    image : imageName,
                    title : imageTitle
                });
            }
            let buttons = toolbar.AddImageRadioButton (imageData, selectedIndex, (buttonIndex) => {
                onClick (buttonIndex);
            });
            for (let className of classNames) {
                for (let button of buttons) {
                    button.AddClass (className);
                }
            }
        }

        function AddSeparator (toolbar, classNames)
        {
            let separator = toolbar.AddSeparator ();
            if (classNames !== null) {
                for (let className of classNames) {
                    separator.classList.add (className);
                }
            }
        }

        let importer = this.modelLoaderUI.GetImporter ();
        let navigationModeIndex = (this.cameraSettings.navigationMode === NavigationMode.FixedUpVector ? 0 : 1);
        let projectionModeIndex = (this.cameraSettings.projectionMode === ProjectionMode.Perspective ? 0 : 1);

        AddButton (this.toolbar, 'open', Loc ('Open from your device'), [], () => {
            this.OpenFileBrowserDialog ();
        });
        AddButton (this.toolbar, 'open_url', Loc ('Open from url'), [], () => {
            ShowOpenUrlDialog ((urls) => {
                if (urls.length > 0) {
                    this.hashHandler.SetModelFilesToHash (urls);
                }
            });
        });
        AddSeparator (this.toolbar, ['only_on_model']);
        AddButton (this.toolbar, 'fit', Loc ('Fit model to window'), ['only_on_model'], () => {
            this.FitModelToWindow (false);
        });
        AddButton (this.toolbar, 'up_y', Loc ('Set Y axis as up vector'), ['only_on_model'], () => {
            this.viewer.SetUpVector (Direction.Y, true);
        });
        AddButton (this.toolbar, 'up_z', Loc ('Set Z axis as up vector'), ['only_on_model'], () => {
            this.viewer.SetUpVector (Direction.Z, true);
        });
        AddButton (this.toolbar, 'flip', Loc ('Flip up vector'), ['only_on_model'], () => {
            this.viewer.FlipUpVector ();
        });
        AddSeparator (this.toolbar, ['only_full_width', 'only_on_model']);
        AddRadioButton (this.toolbar, ['fix_up_on', 'fix_up_off'], [Loc ('Fixed up vector'), Loc ('Free orbit')], navigationModeIndex, ['only_full_width', 'only_on_model'], (buttonIndex) => {
            if (buttonIndex === 0) {
                this.cameraSettings.navigationMode = NavigationMode.FixedUpVector;
            } else if (buttonIndex === 1) {
                this.cameraSettings.navigationMode = NavigationMode.FreeOrbit;
            }
            this.cameraSettings.SaveToCookies ();
            this.viewer.SetNavigationMode (this.cameraSettings.navigationMode);
        });
        AddSeparator (this.toolbar, ['only_full_width', 'only_on_model']);
        AddRadioButton (this.toolbar, ['camera_perspective', 'camera_orthographic'], [Loc ('Perspective camera'), Loc ('Orthographic camera')], projectionModeIndex, ['only_full_width', 'only_on_model'], (buttonIndex) => {
            if (buttonIndex === 0) {
                this.cameraSettings.projectionMode = ProjectionMode.Perspective;
            } else if (buttonIndex === 1) {
                this.cameraSettings.projectionMode = ProjectionMode.Orthographic;
            }
            this.cameraSettings.SaveToCookies ();
            this.viewer.SetProjectionMode (this.cameraSettings.projectionMode);
            this.sidebar.UpdateControlsVisibility ();
        });
        AddSeparator (this.toolbar, ['only_full_width', 'only_on_model']);

        // Transform mode radio buttons (Move / Rotate / Scale)
        let transformButtonData = [
            { image : 'flip', title : Loc ('Move (T)') },
            { image : 'fix_up_off', title : Loc ('Rotate (R)') },
            { image : 'expand', title : Loc ('Scale (S)') }
        ];
        let transformButtons = this.toolbar.AddImageRadioButton (transformButtonData, -1, (buttonIndex) => {
            let modes = ['translate', 'rotate', 'scale'];
            eventBus.emit (Events.ModeChanged, { mode : modes[buttonIndex] });
        });
        for (let btn of transformButtons) {
            btn.AddClass ('only_full_width');
            btn.AddClass ('only_on_model');
        }
        this.transformModeButtonsArray = transformButtons;

        // Snap toggle
        let snapButton = AddPushButton (this.toolbar, 'fit', Loc ('Snap (toggle)'), ['only_full_width', 'only_on_model'], (isSelected) => {
            if (this.snapSystem) {
                this.snapSystem.setEnabled (isSelected);
            }
        });
        snapButton.SetSelected (true); // ON by default
        this.snapButton = snapButton;

        // Listen for snap toggle events to sync button state
        eventBus.on (Events.SnapToggled, ({ enabled }) => {
            if (this.snapButton) {
                this.snapButton.SetSelected (enabled);
            }
        });

        // Listen for mode changes to sync transform mode buttons
        eventBus.on (Events.ModeChanged, ({ mode }) => {
            if (this.transformModeButtonsArray) {
                let modes = ['translate', 'rotate', 'scale'];
                let idx = modes.indexOf (mode);
                for (let i = 0; i < this.transformModeButtonsArray.length; i++) {
                    this.transformModeButtonsArray[i].SetSelected (i === idx);
                }
            }
        });

        AddSeparator (this.toolbar, ['only_full_width', 'only_on_model']);

        AddButton (this.toolbar, 'close', Loc ('Deselect All'), ['only_full_width', 'only_on_model'], () => {
            this.selectionManager.deselectAll ();
        });

        AddSeparator (this.toolbar, ['only_full_width', 'only_on_model']);
        let measureToolButton = AddPushButton (this.toolbar, 'measure', Loc ('Measure'), ['only_full_width', 'only_on_model'], (isSelected) => {
            HandleEvent ('measure_tool_activated', isSelected ? 'on' : 'off');
            this.selectionManager.deselectAll ();
            this.measureTool.SetActive (isSelected);
            if (isSelected) {
                eventBus.emit (Events.ModeChanged, { mode : 'measure' });
            } else {
                eventBus.emit (Events.ModeChanged, { mode : 'none' });
            }
        });
        this.measureTool.SetButton (measureToolButton);
        AddSeparator (this.toolbar, ['only_full_width', 'only_on_model']);
        AddButton (this.toolbar, 'download', Loc ('Download'), ['only_full_width', 'only_on_model'], () => {
            HandleEvent ('model_downloaded', '');
            let importer = this.modelLoaderUI.GetImporter ();
            DownloadModel (importer);
        });
        AddButton (this.toolbar, 'export', Loc ('Export'), ['only_full_width', 'only_on_model'], () => {
            ShowExportDialog (this.model, this.viewer, {
                isMeshVisible : (meshInstanceId) => {
                    return this.navigator.IsMeshVisible (meshInstanceId);
                }
            });
        });
        AddButton (this.toolbar, 'share', Loc ('Share'), ['only_full_width', 'only_on_model'], () => {
            ShowSharingDialog (importer.GetFileList (), this.settings, this.viewer);
        });
        AddSeparator (this.toolbar, ['only_full_width', 'only_on_model']);
        AddButton (this.toolbar, 'snapshot', Loc ('Create snapshot'), ['only_full_width', 'only_on_model'], () => {
            ShowSnapshotDialog (this.viewer);
        });

        EnumeratePlugins (PluginType.Toolbar, (plugin) => {
            plugin.registerButtons ({
                createSeparator : (classNames) => {
                    AddSeparator (this.toolbar, classNames);
                },
                createButton : (icon, title, classNames, onClick) => {
                    AddButton (this.toolbar, icon, title, classNames, onClick);
                },
                getModel : () => {
                    return this.model;
                }
            });
        });

        let selectedTheme = (this.settings.themeId === Theme.Light ? 1 : 0);
        AddRadioButton (this.toolbar, ['dark_mode', 'light_mode'], [Loc ('Dark mode'), Loc ('Light mode')], selectedTheme, ['align_right'], (buttonIndex) => {
            if (buttonIndex === 0) {
                this.settings.themeId = Theme.Dark;
            } else if (buttonIndex === 1) {
                this.settings.themeId = Theme.Light;
            }
            HandleEvent ('theme_changed', this.settings.themeId === Theme.Light ? 'light' : 'dark');
            this.SwitchTheme (this.settings.themeId, true);
        });

        this.parameters.fileInput.addEventListener ('change', (ev) => {
            if (ev.target.files.length > 0) {
                HandleEvent ('model_load_started', 'open_file');
                this.LoadModelFromFileList (ev.target.files);
            }
        });
    }

    InitSidebarActions ()
    {
        this.sidebar.detailsPanel.SetActionCallbacks ({
            focus : () => {
                this.FitModelToWindow (false);
            },
            ground : () => {
                this.ApplyGroundToSelection ();
            },
            rotateY : (angle) => {
                this.ApplyRotateYToSelection (angle);
            },
            deleteSelection : () => {
                if (!this.model || !this.selectionManager) {
                    return;
                }
                let entries = this.selectionManager.getSelection ().filter ((e) => e.type === 'mesh');
                // Remove from highest index first to avoid index shifting
                let indices = entries.map ((e) => e.meshIndex).sort ((a, b) => b - a);
                let uniqueIndices = [...new Set (indices)];
                for (let idx of uniqueIndices) {
                    this.model.RemoveMesh (idx);
                }
                this.selectionManager.deselectAll ();
                if (this.model) {
                    this.navigator.FillTree ({
                        model : this.model,
                        missingFiles : []
                    });
                }
                this.viewer.Render ();
            }
        });
    }

    InitDragAndDrop ()
    {
        window.addEventListener ('dragstart', (ev) => {
            ev.preventDefault ();
        }, false);

        window.addEventListener ('dragover', (ev) => {
            ev.stopPropagation ();
            ev.preventDefault ();
            ev.dataTransfer.dropEffect = 'copy';
        }, false);

        window.addEventListener ('drop', (ev) => {
            ev.stopPropagation ();
            ev.preventDefault ();
            GetFilesFromDataTransfer (ev.dataTransfer, (files) => {
                if (files.length > 0) {
                    HandleEvent ('model_load_started', 'drop');
                    this.LoadModelFromFileList (files);
                }
            });
        }, false);
    }

    GetSelectionPivot ()
    {
        if (!this.model || !this.selectionManager) {
            return null;
        }
        let entries = this.selectionManager.getSelection ().filter ((e) => e.type === 'mesh' || e.type === 'node');
        if (entries.length === 0) {
            return null;
        }
        let sumX = 0, sumY = 0, sumZ = 0, count = 0;
        for (let entry of entries) {
            let node = this.model.FindNodeById (entry.nodeId);
            if (node) {
                let worldTransform = node.GetWorldTransformation ();
                let m = worldTransform.GetMatrix ().Get ();
                sumX += m[12]; sumY += m[13]; sumZ += m[14]; count++;
            }
        }
        return count > 0 ? { x : sumX / count, y : sumY / count, z : sumZ / count } : null;
    }

    ApplyGroundToSelection ()
    {
        if (!this.model || !this.selectionManager) {
            return;
        }
        let entries = this.selectionManager.getSelection ().filter ((e) => e.type === 'mesh' || e.type === 'node');
        if (entries.length === 0) {
            return;
        }
        // Find minimum world Y across all selected nodes
        let minY = Infinity;
        for (let entry of entries) {
            let node = this.model.FindNodeById (entry.nodeId);
            if (!node) { continue; }
            let worldTransform = node.GetWorldTransformation ();
            let m = worldTransform.GetMatrix ().Get ();
            if (m[13] < minY) { minY = m[13]; }
        }
        if (!isFinite (minY) || Math.abs (minY) < 1e-4) {
            return;
        }
        let offsetY = -minY;
        for (let entry of entries) {
            let node = this.model.FindNodeById (entry.nodeId);
            if (!node) { continue; }
            let localMatrix = node.GetTransformation ().GetMatrix ().Get ().slice ();
            localMatrix[13] += offsetY;
            node.SetTransformation (new Transformation (new Matrix (localMatrix)));
        }
        this.viewer.Render ();
        eventBus.emit (Events.TransformApplied, { type : 'ground' });
    }

    ApplyRotateYToSelection (angle)
    {
        if (!this.model || !this.selectionManager) {
            return;
        }
        let entries = this.selectionManager.getSelection ().filter ((e) => e.type === 'mesh' || e.type === 'node');
        if (entries.length === 0) {
            return;
        }
        let pivot = this.GetSelectionPivot ();
        if (!pivot) {
            return;
        }

        let axisY = { x : 0, y : 1, z : 0 };

        for (let entry of entries) {
            let node = this.model.FindNodeById (entry.nodeId);
            if (!node) { continue; }

            let localM = node.GetTransformation ().GetMatrix ();
            let parent = node.GetParent ();
            let worldM = parent !== null
                ? localM.MultiplyMatrix (parent.GetWorldTransformation ().GetMatrix ())
                : localM.Clone ();

            let newWorldM;
            if (angle === null) {
                // Reset Y rotation: decompose and recompose with identity rotation
                let trs = worldM.DecomposeTRS ();
                let identity = { x : 0, y : 0, z : 0, w : 1 };
                let newMatrix = new Matrix ();
                newMatrix.ComposeTRS (trs.translation, identity, trs.scale);
                newWorldM = newMatrix;
            } else {
                let rotMatrix = new Matrix ();
                rotMatrix.CreateRotationAxisAngle (axisY, angle);
                let toPivot = new Matrix ().CreateTranslation (-pivot.x, -pivot.y, -pivot.z);
                let fromPivot = new Matrix ().CreateTranslation (pivot.x, pivot.y, pivot.z);
                let result = toPivot.MultiplyMatrix (worldM);
                result = rotMatrix.MultiplyMatrix (result);
                newWorldM = fromPivot.MultiplyMatrix (result);
            }

            let newLocalM;
            if (parent !== null) {
                let parentInv = parent.GetWorldTransformation ().GetMatrix ().Clone ();
                parentInv.Invert ();
                newLocalM = newWorldM.MultiplyMatrix (parentInv);
            } else {
                newLocalM = newWorldM;
            }
            node.SetTransformation (new Transformation (newLocalM));
        }
        this.viewer.Render ();
        eventBus.emit (Events.TransformApplied, { type : 'rotateY', angle });
    }

    InitSidebar ()
    {
        this.sidebar.Init ({
            getShadingType : () => {
                return this.viewer.GetShadingType ();
            },
            getProjectionMode : () => {
                return this.viewer.GetProjectionMode ();
            },
            getDefaultMaterials : () => {
                return GetDefaultMaterials (this.model);
            },
            onEnvironmentMapChanged : () => {
                this.settings.SaveToCookies ();
                this.UpdateEnvironmentMap ();
                if (this.measureTool.IsActive ()) {
                    this.measureTool.UpdatePanel ();
                }
            },
            onBackgroundColorChanged : () => {
                this.settings.SaveToCookies ();
                this.viewer.SetBackgroundColor (this.settings.backgroundColor);
                if (this.measureTool.IsActive ()) {
                    this.measureTool.UpdatePanel ();
                }
            },
            onDefaultColorChanged : () => {
                this.settings.SaveToCookies ();
                let modelLoader = this.modelLoaderUI.GetModelLoader ();
                if (modelLoader.GetDefaultMaterials () !== null) {
                    ReplaceDefaultMaterialsColor (this.model, this.settings.defaultColor, this.settings.defaultLineColor);
                    modelLoader.ReplaceDefaultMaterialsColor (this.settings.defaultColor, this.settings.defaultLineColor);
                }
                this.viewer.Render ();
            },
            onEdgeDisplayChanged : () => {
                HandleEvent ('edge_display_changed', this.settings.showEdges ? 'on' : 'off');
                this.UpdateEdgeDisplay ();
            },
            onResizeRequested : () => {
                this.layouter.Resize ();
            },
            onShowHidePanels : (show) => {
                ShowDomElement (this.parameters.sidebarSplitterDiv, show);
                CookieSetBoolVal ('ov_show_sidebar', show);
            }
        });
    }

    InitNavigator ()
    {
        function GetMeshUserDataArray (viewer, meshInstanceId)
        {
            let userDataArr = [];
            viewer.EnumerateMeshesAndLinesUserData ((meshUserData) => {
                if (meshUserData.originalMeshInstance.id.IsEqual (meshInstanceId)) {
                    userDataArr.push (meshUserData);
                }
            });
            return userDataArr;
        }

        function GetMeshesForMaterial (viewer, materialIndex)
        {
            let usedByMeshes = [];
            viewer.EnumerateMeshesAndLinesUserData ((meshUserData) => {
                if (materialIndex === null || meshUserData.originalMaterials.indexOf (materialIndex) !== -1) {
                    usedByMeshes.push (meshUserData.originalMeshInstance);
                }
            });
            return usedByMeshes;
        }

        function GetMaterialReferenceInfo (model, materialIndex)
        {
            const material = model.GetMaterial (materialIndex);
            return {
                index : materialIndex,
                name : material.name,
                color : material.color.Clone ()
            };
        }

        function GetMaterialsForMesh (viewer, model, meshInstanceId)
        {
            let usedMaterials = [];
            if (meshInstanceId === null) {
                for (let materialIndex = 0; materialIndex < model.MaterialCount (); materialIndex++) {
                    usedMaterials.push (GetMaterialReferenceInfo (model, materialIndex));
                }
            } else {
                let userDataArr = GetMeshUserDataArray (viewer, meshInstanceId);
                let addedMaterialIndices = new Set ();
                for (let userData of userDataArr) {
                    for (let materialIndex of userData.originalMaterials) {
                        if (addedMaterialIndices.has (materialIndex)) {
                            continue;
                        }
                        usedMaterials.push (GetMaterialReferenceInfo (model, materialIndex));
                        addedMaterialIndices.add (materialIndex);
                    }
                }
            }
            usedMaterials.sort ((a, b) => {
                return a.index - b.index;
            });
            return usedMaterials;
        }

        this.navigator.Init ({
            selectionManager : this.selectionManager,
            inputManager : this.inputManager,
            contextMenu : this.contextMenu,
            groupDialogCallback : () => {
                this.OnMoveToGroupRequested ();
            },
            openFileBrowserDialog : () => {
                this.OpenFileBrowserDialog ();
            },
            fitMeshToWindow : (meshInstanceId) => {
                this.FitMeshToWindow (meshInstanceId);
            },
            fitMeshesToWindow : (meshInstanceIdSet) => {
                this.FitMeshesToWindow (meshInstanceIdSet);
            },
            getMeshesForMaterial : (materialIndex) => {
                return GetMeshesForMaterial (this.viewer, materialIndex);
            },
            getMaterialsForMesh : (meshInstanceId) => {
                return GetMaterialsForMesh (this.viewer, this.model, meshInstanceId);
            },
            onMeshVisibilityChanged : () => {
                this.UpdateMeshesVisibility ();
            },
            onMeshSelectionChanged : () => {
                this.UpdateMeshesSelection ();
            },
            onSelectionCleared : () => {
                this.sidebar.AddObject3DProperties (this.model, this.model);
            },
            onMeshSelected : (meshInstanceId) => {
                let meshInstance = this.model.GetMeshInstance (meshInstanceId);
                this.sidebar.AddObject3DProperties (this.model, meshInstance);
            },
            onMaterialSelected : (materialIndex) => {
                this.sidebar.AddMaterialProperties (this.model.GetMaterial (materialIndex));
            },
            onResizeRequested : () => {
                this.layouter.Resize ();
            },
            onShowHidePanels : (show) => {
                ShowDomElement (this.parameters.navigatorSplitterDiv, show);
                CookieSetBoolVal ('ov_show_navigator', show);
            }
        });
    }

    OnMoveToGroupRequested ()
    {
        if (this.model === null) {
            return;
        }
        // GroupDialog will be initialized in Phase 4 Task 4
        if (this.groupDialog) {
            this.groupDialog.Show (this.model, this.groupManager, this.selectionManager, () => {
                this.navigator.FillTree ({ model : this.model, missingFiles : [] });
            });
        }
    }

    UpdatePanelsVisibility ()
    {
        let showNavigator = CookieGetBoolVal ('ov_show_navigator', true);
        let showSidebar = CookieGetBoolVal ('ov_show_sidebar', true);
        this.navigator.ShowPanels (showNavigator);
        this.sidebar.ShowPanels (showSidebar);
    }

    CreateHeaderButton (icon, title, link)
    {
        let buttonLink = CreateDomElement ('a');
        buttonLink.setAttribute ('href', link);
        buttonLink.setAttribute ('target', '_blank');
        buttonLink.setAttribute ('rel', 'noopener noreferrer');
        InstallTooltip (buttonLink, title);
        AddSvgIconElement (buttonLink, icon, 'header_button');
        this.parameters.headerButtonsDiv.appendChild (buttonLink);
        return buttonLink;
    }

    InitCookieConsent ()
    {
        let accepted = CookieGetBoolVal ('ov_cookie_consent', false);
        if (accepted) {
            return;
        }

        let text = Loc ('This website uses cookies to offer you better user experience. See the details at the <a target="_blank" href="info/cookies.html">Cookies Policy</a> page.');
        let popupDiv = AddDiv (document.body, 'ov_bottom_floating_panel');
        AddDiv (popupDiv, 'ov_floating_panel_text', text);
        let acceptButton = AddDiv (popupDiv, 'ov_button ov_floating_panel_button', Loc ('Accept'));
        acceptButton.addEventListener ('click', () => {
            CookieSetBoolVal ('ov_cookie_consent', true);
            popupDiv.remove ();
        });
    }
}
