'''
Generates a zip that contains the core files the compilation programs need
This includes headers, libraries, and of course SplashKit
'''
import shutil
import os
import sys
import io
import zipfile

splashkit_library_path = sys.argv[1]
splashkit_includes_path = sys.argv[2]
sysroot_path = sys.argv[3]
output_archive_path = sys.argv[4]

splashkit_sysroot_library_path = "lib/"
splashkit_sysroot_includes_path = "include/splashkit/"

try:
    with open(sysroot_path, 'rb') as f:
        original_zip_content = f.read()
except:
    sys.exit("\033[91mFailed to read in system root prebuilt zip file at "+sysroot_path+"\033[0m")


def copy_in_file(new_zip, filename, newfilename):
    with open(filename, 'rb') as f:
        file_content = f.read()
    new_zip.writestr(newfilename, file_content)

with io.BytesIO() as new_zip_buffer:
    # start by copying the original system root zip into memory
    new_zip_buffer.write(original_zip_content)

    # access it as a zip, and add files to it
    with zipfile.ZipFile(new_zip_buffer, 'a', compression=zipfile.ZIP_DEFLATED) as new_zip:
        copy_in_file(new_zip, splashkit_library_path, splashkit_sysroot_library_path+"libSplashKitBackend.a");


        global_header = "// autogenerated by cxx_backend_systemroot_builder.py - will be overwritten easily!\n"
        global_header += "// all SplashKit includes:\n"

        for file in os.listdir(splashkit_includes_path):
            if ".h" in file and 'raspi_gpio' not in file:
                copy_in_file(new_zip, splashkit_includes_path+file, splashkit_sysroot_includes_path+file);

                global_header += "#include \"splashkit/"+file+"\"\n"

        global_header += """
        // mimic namespacelessness of normal SplashKit Clib-based C++ version
        using namespace splashkit_lib;
        """

        new_zip.writestr("include/splashkit.h", global_header)

    new_zip_buffer.seek(0)

    # now write it out!
    with open(output_archive_path, 'wb') as f:
        f.write(new_zip_buffer.getvalue())