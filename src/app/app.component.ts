import { Component, OnInit, AfterViewInit, ViewChild, ElementRef } from '@angular/core';

declare const WebViewer: any;

declare const initNudgeTool: any;
declare const setUpNudgeToolAndAppendToIFrame: any;
declare const setInstance: any;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements AfterViewInit {
  /**
   * https://www.pdftron.com/documentation/web/get-started/angular/exist-project
   */
  @ViewChild('middlePanel') midPanelViewer: ElementRef;

  wvInstance: any;

  ngAfterViewInit(): void {
    /**
     * https://github.com/angular/angular-cli/wiki/stories-asset-configuration
     * /webviewer defined in ANgular json
     */
    WebViewer({
      path: '/webviewer',
      initialDoc: 'https://pdftron.s3.amazonaws.com/downloads/pl/webviewer-demo.pdf'
    }, this.midPanelViewer.nativeElement).then(instance => {
      this.wvInstance = instance;
      // setUpNudgeToolAndAppendToIFrame();
      // initNudgeTool();

      instance.docViewer.one('finishedRendering', function() {
        // run this only once
        // in IE11, this event is called everytime a pdf is rotated or zoomed in
        // eslint-disable-next-line no-undef
        setInstance(instance);
        initNudgeTool();
        setUpNudgeToolAndAppendToIFrame();

      });
    });
  }
}
