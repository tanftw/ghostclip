export namespace main {
	
	export class Snippet {
	    name: string;
	    subPath: string;
	    preview: string;
	    isImage: boolean;
	    fileSize: number;
	
	    static createFrom(source: any = {}) {
	        return new Snippet(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.subPath = source["subPath"];
	        this.preview = source["preview"];
	        this.isImage = source["isImage"];
	        this.fileSize = source["fileSize"];
	    }
	}

}

