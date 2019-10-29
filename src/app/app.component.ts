import { Component, OnInit, AfterViewInit, ViewChild, ElementRef } from '@angular/core';

declare const WebViewer: any;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, AfterViewInit {
  /**
   * https://www.pdftron.com/documentation/web/get-started/angular/exist-project
   */
  @ViewChild('viewer') viewer: ElementRef;

  wvInstance: any;
  ngOnInit(): void {

  }
  ngAfterViewInit(): void {
    /**
     * https://github.com/angular/angular-cli/wiki/stories-asset-configuration
     * /webviewer defined in ANgular json
     */
    WebViewer({
      path: '/webviewer',
      initialDoc: 'https://pdftron.s3.amazonaws.com/downloads/pl/webviewer-demo.pdf'
    }, this.viewer.nativeElement).then(instance => {
      this.wvInstance = instance;

      // now you can access APIs through this.webviewer.getInstance()
      instance.openElement('notesPanel');
      // see https://www.pdftron.com/documentation/web/guides/ui/apis 
      // for the full list of APIs

      // or listen to events from the viewer element
      this.viewer.nativeElement.addEventListener('pageChanged', (e) => {
        const [ pageNumber ] = e.detail;
        console.log(`Current page is ${pageNumber}`);
      });

      // or from the docViewer instance
      instance.docViewer.on('annotationsLoaded', () => {
        console.log('annotations loaded');
      });
    });
  }
}
